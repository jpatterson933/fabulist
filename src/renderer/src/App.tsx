import { useEffect } from 'react'
import { FONT_CHOICES } from '@shared/types'
import { useStore } from '@/store'
import Library from '@/components/Library'
import Editor from '@/components/Editor'
import Sidebar from '@/components/Sidebar'
import VersionPreview from '@/components/VersionPreview'
import SkillStudio from '@/studio/SkillStudio'

export default function App(): React.JSX.Element {
  const mode = useStore((s) => s.mode)
  const activeId = useStore((s) => s.activeId)
  const docs = useStore((s) => s.docs)
  const doc = docs.find((d) => d.id === activeId)
  const preview = useStore((s) => s.preview)
  const agent = useStore((s) => (activeId ? s.agent[activeId] : undefined))
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const libraryOpen = useStore((s) => s.libraryOpen)
  const toggleLibrary = useStore((s) => s.toggleLibrary)
  const snapshot = useStore((s) => s.snapshot)
  const lastError = useStore((s) => s.lastError)
  const dismissError = useStore((s) => s.dismissError)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === '\\' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        const s = useStore.getState()
        if (s.mode === 'skillStudio') s.toggleStudioRail()
        else s.toggleLibrary()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (mode === 'skillStudio') return <SkillStudio />

  return (
    <div className={`app ${libraryOpen ? '' : 'library-closed'}`}>
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
            {doc && (
              <>
                <h1>{doc.title}</h1>
                <span className="workspace-meta">
                  {doc.wordCount.toLocaleString()} words
                  {agent && agent.status !== 'idle' && agent.status !== 'done' && (
                    <span className={`agent-dot agent-${agent.status}`} />
                  )}
                </span>
              </>
            )}
          </div>
          {doc && (
            <div className="workspace-actions">
              <FontPicker />
              <button className="btn-ghost" onClick={() => snapshot()} title="Save a named point in history">
                Snapshot
              </button>
              <button
                className={`btn-ghost ${sidebarOpen ? 'is-on' : ''}`}
                onClick={toggleSidebar}
                title="Toggle sidebar"
              >
                Panel
              </button>
            </div>
          )}
        </header>

        {doc ? (
          preview ? (
            <VersionPreview />
          ) : (
            <Editor key={doc.id} docId={doc.id} />
          )
        ) : (
          <EmptyState />
        )}
      </main>
      {doc && sidebarOpen && <Sidebar docId={doc.id} />}
      {lastError && (
        <div className="error-toast" role="alert">
          <span className="error-toast-text">{lastError}</span>
          <button className="btn-ghost btn-small" onClick={dismissError} title="Dismiss">
            ✕
          </button>
        </div>
      )}
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

function EmptyState(): React.JSX.Element {
  const createDoc = useStore((s) => s.createDoc)
  return (
    <div className="empty-state">
      <div className="empty-state-inner">
        <span className="empty-state-glyph">❡</span>
        <h2>Every document is a little world.</h2>
        <p>
          Each one is a Claude Code project under the hood — versioned, rewindable, and shared
          with an agent that knows the work. Select a document on the left, or begin a new one.
        </p>
        <button className="btn-primary" onClick={() => createDoc('Untitled')}>
          New document
        </button>
      </div>
    </div>
  )
}
