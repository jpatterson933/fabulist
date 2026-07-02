import { useEffect, useMemo, useState } from 'react'
import { FONT_CHOICES } from '@shared/types'
import { useStore } from '@/store'
import Library, { BlockMark } from '@/components/Library'
import Editor from '@/components/Editor'
import Tabs from '@/components/Tabs'
import Sidebar from '@/components/Sidebar'
import VersionPreview from '@/components/VersionPreview'
import CommandPalette from '@/components/CommandPalette'
import PanelView from '@/components/PanelView'
import CommandView from '@/components/CommandView'
import StudioBanner from '@/components/StudioBanner'
import NewFileDialog from '@/components/NewFileDialog'
import NewProjectDialog from '@/components/NewProjectDialog'

export default function App(): React.JSX.Element {
  const activeProjectId = useStore((s) => s.activeProjectId)
  const files = useStore((s) => s.files)
  const activeFile = useStore((s) => s.activeFile)
  const file = files.find((d) => d.file === activeFile)
  const preview = useStore((s) => s.preview)
  const agent = useStore((s) => (activeProjectId ? s.agent[activeProjectId] : undefined))
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const libraryOpen = useStore((s) => s.libraryOpen)
  const toggleLibrary = useStore((s) => s.toggleLibrary)
  const harness = useStore((s) => s.harness)
  const activePanel = useStore((s) => s.activePanel)
  const setPaletteOpen = useStore((s) => s.setPaletteOpen)
  const panel = harness?.config.panels.find((p) => p.id === activePanel) ?? null
  const command =
    (activePanel?.startsWith('command:') &&
      harness?.config.commands.find((c) => `command:${c.id}` === activePanel)) ||
    null

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === '\\' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        useStore.getState().toggleLibrary()
      }
      if (e.key === 'k' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        if (!useStore.getState().activeProjectId) return
        e.preventDefault()
        useStore.getState().setPaletteOpen(!useStore.getState().paletteOpen)
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
              {agent && agent.status !== 'idle' && agent.status !== 'done' && (
                <span className="workspace-meta">
                  <span className={`agent-dot agent-${agent.status}`} />
                </span>
              )}
              <button
                className="btn-ghost btn-with-kbd"
                onClick={() => setPaletteOpen(true)}
                title="Actions, skills, files"
              >
                Actions <kbd>⌘K</kbd>
              </button>
              {file && !panel && file.type === 'markdown' && <FontPicker />}
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

        {projectOpen && <StudioBanner />}
        {projectOpen ? (
          command ? (
            <CommandView key={command.id} command={command} />
          ) : panel ? (
            <PanelView key={panel.id} panel={panel} />
          ) : preview && file ? (
            <VersionPreview />
          ) : file ? (
            file.type === 'markdown' || file.type === 'text' ? (
              <Editor key={`${activeProjectId}:${file.file}`} projectId={activeProjectId!} file={file.file} />
            ) : file.type === 'image' ? (
              <ImageFile key={`${activeProjectId}:${file.file}`} projectId={activeProjectId!} file={file.file} />
            ) : (
              <UnsupportedFile file={file.file} />
            )
          ) : (
            <NoFileOpen />
          )
        ) : (
          <EmptyState />
        )}
      </main>
      {projectOpen && <Sidebar projectId={activeProjectId!} />}
      <CommandPalette />
      <NewFileDialog />
      <NewProjectDialog />
    </div>
  )
}

function FontPicker(): React.JSX.Element {
  const font = useStore((s) => s.font)
  const setFont = useStore((s) => s.setFont)
  const current = FONT_CHOICES.find((f) => f.value === font) ?? FONT_CHOICES[0]

  // icon-only: the native select sits invisibly on top, so the menu still works
  return (
    <div className="font-picker font-picker-compact" title={`Typeface: ${current.label}`}>
      <span className="font-picker-glyph" style={{ fontFamily: current.stack }} aria-hidden>
        Aa
      </span>
      <select value={current.value} onChange={(e) => setFont(e.target.value)} aria-label="Typeface">
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

function NoFileOpen(): React.JSX.Element {
  const setNewFileOpen = useStore((s) => s.setNewFileOpen)
  return (
    <div className="empty-state">
      <div className="empty-state-inner">
        <span className="empty-state-glyph"><BlockMark size={40} /></span>
        <h2>No file open</h2>
        <p>Open a file from the rail, or start a new one.</p>
        <button className="btn-primary" onClick={() => setNewFileOpen(true)}>
          New file
        </button>
      </div>
    </div>
  )
}

/** Read-only view for image files; reloads by URL whenever the file list refreshes. */
function ImageFile({ projectId, file }: { projectId: string; file: string }): React.JSX.Element {
  const files = useStore((s) => s.files)
  const [rev, setRev] = useState(0)
  useEffect(() => setRev((r) => r + 1), [files])
  const url = useMemo(
    () => `fab-project://${projectId}/${file.split('/').map(encodeURIComponent).join('/')}?v=${rev}`,
    [projectId, file, rev]
  )
  return (
    <div className="image-file">
      <img src={url} alt={file} />
    </div>
  )
}

function UnsupportedFile({ file }: { file: string }): React.JSX.Element {
  const activeProjectId = useStore((s) => s.activeProjectId)
  return (
    <div className="empty-state">
      <div className="empty-state-inner">
        <span className="empty-state-glyph"><BlockMark size={40} /></span>
        <h2>No view for {file} yet</h2>
        <p>This file kind doesn&rsquo;t have a view in the app yet. Open it in Finder instead.</p>
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
  const setNewProjectOpen = useStore((s) => s.setNewProjectOpen)
  return (
    <div className="empty-state">
      <div className="empty-state-inner">
        <span className="empty-state-glyph"><BlockMark size={40} /></span>
        <h2>Every project is a little world.</h2>
        <p>
          A project gathers your files in one place — each a Claude Code workspace under the
          hood, versioned and rewindable, shared with an agent that reads across the whole
          project. Start blank, from a studio built for your kind of work, or describe the work
          and let Claude design the studio around it.
        </p>
        <button className="btn-primary" onClick={() => setNewProjectOpen(true)}>
          New project
        </button>
      </div>
    </div>
  )
}
