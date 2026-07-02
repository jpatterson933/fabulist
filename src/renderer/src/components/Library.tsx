import { useEffect, useMemo, useState } from 'react'
import type { DocMeta } from '@shared/types'
import { useStore } from '@/store'

export default function Library(): React.JSX.Element {
  const railView = useStore((s) => s.railView)
  const activeProjectId = useStore((s) => s.activeProjectId)

  return (
    <aside className="library">
      <div className="library-inner">
        <div className="library-lights" />
        <div className="library-brand">
          <span className="library-brand-glyph" aria-hidden>
            ❡
          </span>
          <span className="library-brand-mark">Fabulist</span>
        </div>
        {railView === 'docs' && activeProjectId ? <DocsView /> : <ProjectsView />}
      </div>
    </aside>
  )
}

function ProjectsView(): React.JSX.Element {
  const projects = useStore((s) => s.projects)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const openProject = useStore((s) => s.openProject)
  const createProject = useStore((s) => s.createProject)
  const deleteProject = useStore((s) => s.deleteProject)
  const loadProjects = useStore((s) => s.loadProjects)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    const t = title.trim()
    setCreating(false)
    setTitle('')
    if (t) await createProject(t)
  }

  const openFolder = async (): Promise<void> => {
    const id = await window.fabulist.library.openFolder()
    if (!id) return
    await loadProjects()
    await openProject(id)
  }

  return (
    <>
      <div className="library-head">
        <span className="library-label">Projects</span>
        <button className="library-new" onClick={() => setCreating(true)} title="New project">
          +
        </button>
      </div>

      {creating && (
        <form
          className="library-create"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <input
            autoFocus
            value={title}
            placeholder="Project title…"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void submit()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setCreating(false)
                setTitle('')
              }
            }}
          />
        </form>
      )}

      <nav className="library-list">
        {projects.length === 0 && !creating && (
          <p className="library-empty">No projects yet. Start one with +</p>
        )}
        {projects.map((p) => (
          <div key={p.id} className={`library-item ${p.id === activeProjectId ? 'is-active' : ''}`}>
            <button className="library-item-main" onClick={() => void openProject(p.id)}>
              <span className="library-item-title">{p.title}</span>
              <span className="library-item-meta">
                {p.studio && <span className="library-item-studio">✦ {p.studio} · </span>}
                {relativeTime(p.updatedAt)} · {p.docCount} {p.docCount === 1 ? 'doc' : 'docs'}
              </span>
            </button>
            {confirmDelete === p.id ? (
              <div className="library-item-confirm">
                <button
                  className="danger"
                  onClick={() => {
                    setConfirmDelete(null)
                    void deleteProject(p.id)
                  }}
                >
                  Delete
                </button>
                <button onClick={() => setConfirmDelete(null)}>Keep</button>
              </div>
            ) : (
              <button
                className="library-item-x"
                title="Delete project"
                onClick={() => setConfirmDelete(p.id)}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </nav>

      <footer className="library-foot">
        <button
          className="btn-ghost"
          onClick={() => void openFolder()}
          title="Open any folder as a project — a fabulist.json inside defines its studio"
        >
          Open folder…
        </button>
      </footer>
    </>
  )
}

/** Docs grouped into their folders; folders sort first, alphabetically. */
interface DocFolder {
  path: string // "" for the root
  name: string
  folders: DocFolder[]
  docs: DocMeta[]
}

function buildDocTree(docs: DocMeta[]): DocFolder {
  const root: DocFolder = { path: '', name: '', folders: [], docs: [] }
  const folderFor = (dir: string): DocFolder => {
    if (dir === '') return root
    let node = root
    let sofar = ''
    for (const seg of dir.split('/')) {
      sofar = sofar ? `${sofar}/${seg}` : seg
      let child = node.folders.find((f) => f.path === sofar)
      if (!child) {
        child = { path: sofar, name: seg, folders: [], docs: [] }
        node.folders.push(child)
        node.folders.sort((a, b) => a.name.localeCompare(b.name))
      }
      node = child
    }
    return node
  }
  for (const d of docs) {
    const slash = d.file.lastIndexOf('/')
    folderFor(slash === -1 ? '' : d.file.slice(0, slash)).docs.push(d)
  }
  return root
}

function DocsView(): React.JSX.Element {
  const projects = useStore((s) => s.projects)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const docs = useStore((s) => s.docs)
  const activeDoc = useStore((s) => s.activeDoc)
  const openTab = useStore((s) => s.openTab)
  const deleteDoc = useStore((s) => s.deleteDoc)
  const setRailView = useStore((s) => s.setRailView)
  const harness = useStore((s) => s.harness)
  const activePanel = useStore((s) => s.activePanel)
  const openPanel = useStore((s) => s.openPanel)
  const openWorkshop = useStore((s) => s.openWorkshop)
  const setNewDocOpen = useStore((s) => s.setNewDocOpen)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // collapse state is remembered per project
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`fabulist:collapsed:${activeProjectId}`)
      setCollapsed(new Set(saved ? (JSON.parse(saved) as string[]) : []))
    } catch {
      setCollapsed(new Set())
    }
  }, [activeProjectId])

  const toggleFolder = (path: string): void => {
    const next = new Set(collapsed)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setCollapsed(next)
    localStorage.setItem(`fabulist:collapsed:${activeProjectId}`, JSON.stringify([...next]))
  }

  const project = projects.find((p) => p.id === activeProjectId)
  const panels = harness?.config.panels ?? []
  const tree = useMemo(() => buildDocTree(docs), [docs])

  const renderDoc = (d: DocMeta, depth: number): React.JSX.Element => (
    <div
      key={d.file}
      className={`library-doc ${d.file === activeDoc && !activePanel ? 'is-active' : ''}`}
      style={{ '--rail-depth': depth } as React.CSSProperties}
    >
      <button
        className="library-doc-main"
        onClick={() => void openTab(d.file)}
        title={d.kindLabel ? `${d.file} · ${d.kindLabel}` : d.file}
      >
        <span className="library-doc-glyph" aria-hidden>
          {d.kindIcon ?? '❡'}
        </span>
        <span className="library-doc-title">{d.title}</span>
      </button>
      {confirmDelete === d.file ? (
        <div className="library-item-confirm">
          <button
            className="danger"
            onClick={() => {
              setConfirmDelete(null)
              void deleteDoc(d.file)
            }}
          >
            Delete
          </button>
          <button onClick={() => setConfirmDelete(null)}>Keep</button>
        </div>
      ) : (
        <button className="library-item-x" title="Delete document" onClick={() => setConfirmDelete(d.file)}>
          ×
        </button>
      )}
    </div>
  )

  const renderFolder = (folder: DocFolder, depth: number): React.JSX.Element => {
    const isCollapsed = collapsed.has(folder.path)
    return (
      <div key={folder.path}>
        <button
          className="library-folder"
          style={{ '--rail-depth': depth } as React.CSSProperties}
          onClick={() => toggleFolder(folder.path)}
          title={folder.path}
        >
          <svg
            className={`library-folder-chevron ${isCollapsed ? '' : 'is-open'}`}
            width="9"
            height="9"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden
          >
            <path d="M4.5 3 7.5 6l-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="library-folder-name">{folder.name}</span>
          <span className="library-folder-count">{folder.docs.length + folder.folders.length}</span>
        </button>
        {!isCollapsed && (
          <>
            {folder.folders.map((f) => renderFolder(f, depth + 1))}
            {folder.docs.map((d) => renderDoc(d, depth + 1))}
          </>
        )}
      </div>
    )
  }

  return (
    <>
      <button className="library-crumb" onClick={() => setRailView('projects')} title="All projects">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M7.5 3 4.5 6l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="library-crumb-title">{project?.title ?? 'Project'}</span>
      </button>

      <button
        className="library-studio"
        onClick={() => void openWorkshop()}
        title={
          harness?.config.name
            ? `${harness.config.description ?? 'This project defines its own studio in fabulist.json'}. Open the workshop to change it.`
            : 'Open the workshop: design a custom studio for this project with the agent — doc types, actions, skills, panels.'
        }
      >
        <span className="library-studio-glyph" aria-hidden>
          ✦
        </span>
        <span className="library-studio-text">
          <span className="library-studio-name">{harness?.config.name ?? 'No studio yet'}</span>
          <span className="library-studio-hint">
            {harness?.config.name ? 'Customize in the workshop' : 'Design one in the workshop'}
          </span>
        </span>
      </button>

      <div className="library-head">
        <span className="library-label">Documents</span>
        <button className="library-new" onClick={() => setNewDocOpen(true)} title="New document">
          +
        </button>
      </div>

      <nav className="library-list">
        {docs.length === 0 && (
          <p className="library-empty">No documents yet. Add one with +</p>
        )}
        {tree.folders.map((f) => renderFolder(f, 0))}
        {tree.docs.map((d) => renderDoc(d, 0))}

        {panels.length > 0 && (
          <>
            <div className="library-head library-head-views">
              <span className="library-label">Views</span>
            </div>
            {panels.map((p) => (
              <div key={p.id} className={`library-doc ${p.id === activePanel ? 'is-active' : ''}`}>
                <button
                  className="library-doc-main"
                  onClick={() => openPanel(p.id)}
                  title={`${p.source} — view from fabulist.json`}
                >
                  <span className="library-doc-glyph" aria-hidden>
                    ▦
                  </span>
                  <span className="library-doc-title">{p.title}</span>
                </button>
              </div>
            ))}
          </>
        )}
      </nav>

      <footer className="library-foot">
        {activeProjectId && (
          <button className="btn-ghost" onClick={() => window.fabulist.library.reveal(activeProjectId)}>
            Reveal in Finder
          </button>
        )}
      </footer>
    </>
  )
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}
