import { useEffect } from 'react'
import { FONT_CHOICES } from '@shared/types'
import { useStore } from '@/store'
import Library from '@/components/Library'
import Editor from '@/components/Editor'
import Tabs from '@/components/Tabs'
import Sidebar from '@/components/Sidebar'
import VersionPreview from '@/components/VersionPreview'

export default function App(): React.JSX.Element {
  const activeProjectId = useStore((s) => s.activeProjectId)
  const docs = useStore((s) => s.docs)
  const activeDoc = useStore((s) => s.activeDoc)
  const doc = docs.find((d) => d.file === activeDoc)
  const preview = useStore((s) => s.preview)
  const agent = useStore((s) => (activeProjectId ? s.agent[activeProjectId] : undefined))
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const libraryOpen = useStore((s) => s.libraryOpen)
  const toggleLibrary = useStore((s) => s.toggleLibrary)
  const snapshot = useStore((s) => s.snapshot)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === '\\' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        useStore.getState().toggleLibrary()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const projectOpen = Boolean(activeProjectId)

  return (
    <div
      className={`app ${libraryOpen ? '' : 'library-closed'} ${
        projectOpen && sidebarOpen ? '' : 'sidebar-closed'
      }`}
    >
      <Library />
      <main className="workspace">
        <header className={`workspace-header ${libraryOpen ? '' : 'with-lights'}`}>
          <div className="workspace-title">
            <button
              className="btn-ghost btn-icon"
              onClick={toggleLibrary}
              title="Toggle library  ⌘\"
            >
              <RailIcon />
            </button>
            {projectOpen ? (
              <Tabs />
            ) : (
              <h1 className="workspace-title-idle">Fabulist</h1>
            )}
          </div>
          {projectOpen && (
            <div className="workspace-actions">
              {doc && (
                <span className="workspace-meta">
                  {doc.wordCount.toLocaleString()} words
                  {agent && agent.status !== 'idle' && agent.status !== 'done' && (
                    <span className={`agent-dot agent-${agent.status}`} />
                  )}
                </span>
              )}
              {doc && <FontPicker />}
              <button className="btn-ghost" onClick={() => snapshot()} title="Save a named point in history">
                Snapshot
              </button>
              <button
                className={`btn-ghost btn-icon ${sidebarOpen ? 'is-on' : ''}`}
                onClick={toggleSidebar}
                title="Toggle sidebar"
              >
                <PanelIcon />
              </button>
            </div>
          )}
        </header>

        {projectOpen ? (
          preview && doc ? (
            <VersionPreview />
          ) : doc ? (
            doc.type === 'markdown' ? (
              <Editor key={`${activeProjectId}:${doc.file}`} projectId={activeProjectId!} docFile={doc.file} />
            ) : (
              <UnsupportedDoc file={doc.file} />
            )
          ) : (
            <NoDocOpen />
          )
        ) : (
          <EmptyState />
        )}
      </main>
      {projectOpen && <Sidebar projectId={activeProjectId!} />}
    </div>
  )
}

function FontPicker(): React.JSX.Element {
  const font = useStore((s) => s.font)
  const setFont = useStore((s) => s.setFont)
  const current = FONT_CHOICES.find((f) => f.value === font) ?? FONT_CHOICES[0]

  return (
    <div className="font-picker" title="Document typeface">
      <span className="font-picker-glyph" style={{ fontFamily: current.stack }} aria-hidden>
        Aa
      </span>
      <select value={current.value} onChange={(e) => setFont(e.target.value)}>
        {FONT_CHOICES.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function RailIcon(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6 2.5v11" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

function PanelIcon(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10 2.5v11" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

function NoDocOpen(): React.JSX.Element {
  const createDoc = useStore((s) => s.createDoc)
  return (
    <div className="empty-state">
      <div className="empty-state-inner">
        <span className="empty-state-glyph">❡</span>
        <h2>No document open</h2>
        <p>Open a document with the + in the tab bar, or start a new one.</p>
        <button className="btn-primary" onClick={() => createDoc('Untitled')}>
          New document
        </button>
      </div>
    </div>
  )
}

function UnsupportedDoc({ file }: { file: string }): React.JSX.Element {
  const activeProjectId = useStore((s) => s.activeProjectId)
  return (
    <div className="empty-state">
      <div className="empty-state-inner">
        <span className="empty-state-glyph">❡</span>
        <h2>Can&rsquo;t open {file} here yet</h2>
        <p>Fabulist edits Markdown documents for now. Open this file in Finder to view it.</p>
        {activeProjectId && (
          <button className="btn-ghost" onClick={() => window.fabulist.library.reveal(activeProjectId)}>
            Reveal in Finder
          </button>
        )}
      </div>
    </div>
  )
}

function EmptyState(): React.JSX.Element {
  const createProject = useStore((s) => s.createProject)
  return (
    <div className="empty-state">
      <div className="empty-state-inner">
        <span className="empty-state-glyph">❡</span>
        <h2>Every project is a little world.</h2>
        <p>
          A project gathers your documents in one place — each a Claude Code workspace under the
          hood, versioned and rewindable, shared with an agent that reads across the whole project.
          Select a project on the left, or begin a new one.
        </p>
        <button className="btn-primary" onClick={() => createProject('Untitled')}>
          New project
        </button>
      </div>
    </div>
  )
}
