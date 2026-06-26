import { useState } from 'react'
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
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    const t = title.trim()
    setCreating(false)
    setTitle('')
    if (t) await createProject(t)
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
    </>
  )
}

function DocsView(): React.JSX.Element {
  const projects = useStore((s) => s.projects)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const docs = useStore((s) => s.docs)
  const activeDoc = useStore((s) => s.activeDoc)
  const openTab = useStore((s) => s.openTab)
  const deleteDoc = useStore((s) => s.deleteDoc)
  const createDoc = useStore((s) => s.createDoc)
  const setRailView = useStore((s) => s.setRailView)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const project = projects.find((p) => p.id === activeProjectId)

  const submit = async (): Promise<void> => {
    const t = title.trim()
    setCreating(false)
    setTitle('')
    if (t) await createDoc(t)
  }

  return (
    <>
      <button className="library-crumb" onClick={() => setRailView('projects')} title="All projects">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M7.5 3 4.5 6l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="library-crumb-title">{project?.title ?? 'Project'}</span>
      </button>

      <div className="library-head">
        <span className="library-label">Documents</span>
        <button className="library-new" onClick={() => setCreating(true)} title="New document">
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
            placeholder="Document title…"
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
        {docs.length === 0 && !creating && (
          <p className="library-empty">No documents yet. Add one with +</p>
        )}
        {docs.map((d) => (
          <div key={d.file} className={`library-doc ${d.file === activeDoc ? 'is-active' : ''}`}>
            <button className="library-doc-main" onClick={() => void openTab(d.file)} title={d.file}>
              <span className="library-doc-glyph" aria-hidden>
                ❡
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
              <button
                className="library-item-x"
                title="Delete document"
                onClick={() => setConfirmDelete(d.file)}
              >
                ×
              </button>
            )}
          </div>
        ))}
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
