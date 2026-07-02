import { useState } from 'react'
import { useStore } from '@/store'
import FileTree from './FileTree'

/** The brand mark: a 2×2 module grid with one lit cell. */
export function BlockMark({ size = 14 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="currentColor" aria-hidden>
      <rect x="0" y="0" width="6" height="6" />
      <rect x="8" y="0" width="6" height="6" opacity="0.3" />
      <rect x="0" y="8" width="6" height="6" opacity="0.3" />
      <rect x="8" y="8" width="6" height="6" className="brand-cell-accent" />
    </svg>
  )
}

export default function Library(): React.JSX.Element {
  const railView = useStore((s) => s.railView)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const toggleLibrary = useStore((s) => s.toggleLibrary)

  return (
    <aside className="library">
      <div className="library-inner">
        <div className="library-lights">
          <button
            className="library-close"
            onClick={toggleLibrary}
            title="Close library  ⌘\"
            aria-label="Close library"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
              <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
              <path d="M6 2.5v11" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </button>
        </div>
        <div className="library-brand">
          <span className="library-brand-glyph" aria-hidden>
            <BlockMark />
          </span>
          <span className="library-brand-mark">Fabulist</span>
        </div>
        {railView === 'files' && activeProjectId ? <DocsView /> : <ProjectsView />}
      </div>
    </aside>
  )
}

function ProjectsView(): React.JSX.Element {
  const projects = useStore((s) => s.projects)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const openProject = useStore((s) => s.openProject)
  const deleteProject = useStore((s) => s.deleteProject)
  const loadProjects = useStore((s) => s.loadProjects)
  const setNewProjectOpen = useStore((s) => s.setNewProjectOpen)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const openFolder = async (): Promise<void> => {
    const id = await window.fabulist.library.openFolder()
    if (!id) return
    await loadProjects()
    await openProject(id)
  }

  return (
    <>
      <div className="library-head">
        <span className="library-label mod-projects">Projects</span>
        <button className="library-new" onClick={() => setNewProjectOpen(true)} title="New project">
          +
        </button>
      </div>

      <nav className="library-list">
        {projects.length === 0 && (
          <p className="library-empty">No projects yet. Start one with +</p>
        )}
        {projects.map((p) => (
          <div key={p.id} className={`library-item ${p.id === activeProjectId ? 'is-active' : ''}`}>
            <button className="library-item-main" onClick={() => void openProject(p.id)}>
              <span className="library-item-title">{p.title}</span>
              <span className="library-item-meta">
                {p.studio && (
                  <span className="library-item-studio">
                    {p.studioGlyph ?? '✦'} {p.studio} ·{' '}
                  </span>
                )}
                {relativeTime(p.updatedAt)} · {p.fileCount} {p.fileCount === 1 ? 'file' : 'files'}
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

function DocsView(): React.JSX.Element {
  const projects = useStore((s) => s.projects)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const files = useStore((s) => s.files)
  const activePanel = useStore((s) => s.activePanel)
  const setRailView = useStore((s) => s.setRailView)
  const harness = useStore((s) => s.harness)
  const openPanel = useStore((s) => s.openPanel)
  const openWorkshop = useStore((s) => s.openWorkshop)
  const setNewFileOpen = useStore((s) => s.setNewFileOpen)
  const setPaletteOpen = useStore((s) => s.setPaletteOpen)

  const project = projects.find((p) => p.id === activeProjectId)
  const panels = harness?.config.panels ?? []
  const commands = harness?.config.commands ?? []
  const commandRuns = useStore((s) => s.commandRuns)
  const runCommand = useStore((s) => s.runCommand)
  const stopCommand = useStore((s) => s.stopCommand)

  return (
    <>
      <button className="library-crumb" onClick={() => setRailView('projects')} title="All projects">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M7.5 3 4.5 6l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="library-crumb-title">{project?.title ?? 'Project'}</span>
      </button>

      <button
        className={`library-studio ${harness?.config.name ? '' : 'is-empty'}`}
        onClick={() => void openWorkshop()}
        title={
          harness?.config.name
            ? `${harness.config.description ?? 'This project defines its own studio in fabulist.json'}. Open the workshop to change it.`
            : 'Open the workshop: design a custom studio for this project with the agent — file types, actions, skills, panels.'
        }
      >
        <span className="library-studio-glyph" aria-hidden>
          {harness?.config.theme.glyph ?? '✦'}
        </span>
        <span className="library-studio-text">
          <span className="library-studio-name">{harness?.config.name ?? 'No studio yet'}</span>
          <span className="library-studio-hint">
            {harness?.config.name ? 'Customize in the workshop' : 'Design one in the workshop'}
          </span>
        </span>
      </button>

      <button
        className="library-actions"
        onClick={() => setPaletteOpen(true)}
        title="Actions, skills, files"
      >
        <span className="library-actions-label">Actions</span>
        <kbd>⌘K</kbd>
      </button>

      <div className="library-head">
        <span className="library-label mod-files">Files</span>
        <button className="library-new" onClick={() => setNewFileOpen(true)} title="New file">
          +
        </button>
      </div>

      <nav className="library-list">
        {files.length === 0 && (
          <p className="library-empty">No files yet. Add one with +</p>
        )}
        <FileTree />

        {panels.length > 0 && (
          <>
            <div className="library-head library-head-views">
              <span className="library-label mod-views">Views</span>
            </div>
            {panels.map((p) => (
              <div key={p.id} className={`library-file ${p.id === activePanel ? 'is-active' : ''}`}>
                <button
                  className="library-file-main"
                  onClick={() => openPanel(p.id)}
                  title={`${p.source} — view from fabulist.json`}
                >
                  <span className="library-file-glyph" aria-hidden>
                    ▦
                  </span>
                  <span className="library-file-title">{p.title}</span>
                </button>
              </div>
            ))}
          </>
        )}

        {commands.length > 0 && (
          <>
            <div className="library-head library-head-views">
              <span className="library-label mod-commands">Commands</span>
            </div>
            {commands.map((c) => {
              const running = commandRuns[c.id]?.running ?? false
              return (
                <div
                  key={c.id}
                  className={`library-file ${`command:${c.id}` === activePanel ? 'is-active' : ''}`}
                >
                  <button
                    className="library-file-main"
                    onClick={() => openPanel(`command:${c.id}`)}
                    title={`${c.run} — command from fabulist.json`}
                  >
                    <span
                      className={`library-file-glyph ${running ? 'library-command-running' : ''}`}
                      aria-hidden
                    >
                      {running ? '●' : '▸'}
                    </span>
                    <span className="library-file-title">{c.label}</span>
                  </button>
                  <button
                    className="library-command-toggle"
                    title={running ? 'Stop' : `Run: ${c.run}`}
                    onClick={() => void (running ? stopCommand(c.id) : runCommand(c.id))}
                  >
                    {running ? 'Stop' : 'Run'}
                  </button>
                </div>
              )
            })}
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
