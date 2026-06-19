import { Fragment, useEffect, useMemo, useState } from 'react'
import type { PermissionRequest } from '@shared/types'
import { useStore } from '@/store'
import { formatMarkdown } from '@/lib/markdown'
import { studioInlineEdit } from '@/studio/inlineEdit'
import WorkspaceSwitcher from '@/studio/WorkspaceSwitcher'
import StudioSidebar from '@/studio/StudioSidebar'
import StudioCodeEditor from '@/studio/StudioCodeEditor'
import StudioChanges from '@/studio/StudioChanges'
import StudioDiff from '@/studio/StudioDiff'

const NO_PERMISSIONS: PermissionRequest[] = []

/**
 * The Plugin Studio surface — a separate top-level workspace (mode === 'skillStudio'),
 * laid out to mirror the writing app: a collapsible left rail (whose top-left brand is
 * the same ❡ logo dropdown that switches workspaces), an editor column with its own
 * header + rail toggle, and the jailed test thread. App.tsx branches here on mode.
 */
export default function SkillStudio(): React.JSX.Element {
  const activeSkill = useStore((s) => s.activeSkill)
  const railOpen = useStore((s) => s.studioRailOpen)
  const sidebarWidth = useStore((s) => s.studioSidebarWidth)
  const toggleStudioRail = useStore((s) => s.toggleStudioRail)
  const toggleStudioFiles = useStore((s) => s.toggleStudioFiles)
  const loadStudioSkills = useStore((s) => s.loadStudioSkills)

  useEffect(() => {
    void loadStudioSkills()
  }, [loadStudioSkills])

  return (
    <div
      className={`studio ${railOpen ? '' : 'rail-closed'}`}
      style={{ '--studio-sidebar-w': `${sidebarWidth}px` } as React.CSSProperties}
    >
      <SkillRail />
      <main className={`studio-main ${activeSkill ? '' : 'full'}`}>
        <header className={`workspace-header ${railOpen ? '' : 'with-lights'}`}>
          <div className="workspace-title">
            <button
              className="btn-ghost btn-icon"
              onClick={toggleStudioRail}
              title="Toggle plugins  ⌘\"
            >
              <RailIcon />
            </button>
            {activeSkill && (
              <button className="btn-ghost btn-icon" onClick={toggleStudioFiles} title="Toggle files">
                <FilesIcon />
              </button>
            )}
            {activeSkill && <h1>{activeSkill}</h1>}
          </div>
          {activeSkill && (
            <div className="workspace-actions">
              <button
                className="btn-ghost"
                onClick={() => window.fabulist.skillStudio.reveal(activeSkill)}
                title="Reveal the plugin folder in Finder"
              >
                Reveal
              </button>
            </div>
          )}
        </header>
        {activeSkill ? <SkillEditor slug={activeSkill} /> : <StudioEmpty />}
      </main>
      {activeSkill && <StudioSidebar slug={activeSkill} />}
    </div>
  )
}

function StudioEmpty(): React.JSX.Element {
  return (
    <div className="studio-empty">
      <div className="empty-state-inner">
        <span className="empty-state-glyph" aria-hidden>
          <PluginStudioIcon />
        </span>
        <h2>Create a production-ready plugin.</h2>
        <p>
          Each plugin lives under <code>.skill-studio/</code> — with its own <code>skills/</code>,{' '}
          <code>agents/</code>, and <code>.mcp.json</code>. Create one on the
          left, edit it, then run it in the jailed test thread — no publishing, no setup.
        </p>
      </div>
    </div>
  )
}

function SkillRail(): React.JSX.Element {
  const skills = useStore((s) => s.studioSkills)
  const activeSkill = useStore((s) => s.activeSkill)
  const openStudioSkill = useStore((s) => s.openStudioSkill)
  const createStudioSkill = useStore((s) => s.createStudioSkill)
  const deleteStudioSkill = useStore((s) => s.deleteStudioSkill)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  const submit = (): void => {
    const n = name.trim()
    setCreating(false)
    setName('')
    if (n) void createStudioSkill(n)
  }

  return (
    <aside className="studio-rail">
      <div className="library-lights" />
      <div className="library-brand">
        <WorkspaceSwitcher />
      </div>
      <div className="library-head">
        <span className="library-label">Plugins</span>
        <button
          className="library-new"
          onClick={() => setCreating(true)}
          title="New plugin"
          aria-label="New plugin"
        >
          <PlusIcon />
        </button>
      </div>
      {creating && (
        <div className="library-create">
          <input
            autoFocus
            value={name}
            placeholder="Plugin name"
            onChange={(e) => setName(e.target.value)}
            onBlur={submit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
              if (e.key === 'Escape') {
                setCreating(false)
                setName('')
              }
            }}
          />
        </div>
      )}
      <div className="library-list">
        {skills.length === 0 && !creating && (
          <div className="library-empty">No plugins yet. Click + to create your first one.</div>
        )}
        {skills.map((s) => (
          <div key={s.slug} className={`library-item ${s.slug === activeSkill ? 'is-active' : ''}`}>
            <button className="library-item-main" onClick={() => void openStudioSkill(s.slug)}>
              <span className="library-item-title">{s.name}</span>
              {s.description && <span className="library-item-preview">{s.description}</span>}
              <span className="library-item-meta">{s.slug}</span>
            </button>
            <button
              className="library-item-x"
              title="Delete plugin"
              aria-label={`Delete ${s.name}`}
              onClick={() => setConfirmDel(s.slug)}
            >
              <XIcon />
            </button>
            {confirmDel === s.slug && (
              <div className="library-item-confirm">
                <button
                  className="danger"
                  onClick={() => {
                    void deleteStudioSkill(s.slug)
                    setConfirmDel(null)
                  }}
                >
                  Delete
                </button>
                <button onClick={() => setConfirmDel(null)}>Cancel</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  )
}

function SkillEditor({ slug }: { slug: string }): React.JSX.Element {
  const files = useStore((s) => s.studioFiles)
  const openFilePath = useStore((s) => s.openFilePath)
  const fileContent = useStore((s) => s.fileContent)
  const fileDirty = useStore((s) => s.fileDirty)
  const studioRevealPos = useStore((s) => s.studioRevealPos)
  const authPermissions = useStore((s) => s.authPermissions[slug]) ?? NO_PERMISSIONS
  const openStudioFile = useStore((s) => s.openStudioFile)
  const setFileContent = useStore((s) => s.setFileContent)
  const addStudioFile = useStore((s) => s.addStudioFile)
  const addStudioFolder = useStore((s) => s.addStudioFolder)
  const removeStudioFile = useStore((s) => s.removeStudioFile)
  const loadStudioFiles = useStore((s) => s.loadStudioFiles)
  const startComment = useStore((s) => s.startComment)
  const respondStudioPermission = useStore((s) => s.respondStudioPermission)
  const reportError = useStore((s) => s.reportError)
  const filesOpen = useStore((s) => s.studioFilesOpen)
  const panel = useStore((s) => s.studioPanel)
  const setStudioPanel = useStore((s) => s.setStudioPanel)
  const studioDiff = useStore((s) => s.studioDiff)
  const exportStudioPlugin = useStore((s) => s.exportStudioPlugin)
  const [selText, setSelText] = useState('')
  const [exporting, setExporting] = useState(false)

  // Claude's pending edit to the open file, rendered inline (green/red strike-through)
  // exactly like the document editor; null when nothing is awaiting review for this file
  const inline = useMemo(
    () => studioInlineEdit(fileContent, openFilePath, authPermissions),
    [fileContent, openFilePath, authPermissions]
  )

  // ⌘⏎ accepts, esc declines the pending suggestion (mirrors the document editor)
  useEffect(() => {
    if (!inline) return
    const onKey = (e: KeyboardEvent): void => {
      // Defer to the editor: if a CodeMirror binding already handled this key it
      // will have called preventDefault first (the keydown reaches window only by
      // bubbling). In particular, esc that closed the Find panel must NOT also
      // decline the suggestion — searchKeymap's Escape→closeSearchPanel doesn't
      // stopPropagation, so without this guard dismissing Find would drop the edit.
      if (e.defaultPrevented) return
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        respondStudioPermission(inline.requestId, true)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        respondStudioPermission(inline.requestId, false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inline, respondStudioPermission])

  // right-click menu (create here / delete) and the inline name input it opens
  const [menu, setMenu] = useState<{
    x: number
    y: number
    parentRel: string
    target: { rel: string; isDir: boolean } | null
  } | null>(null)
  const [creating, setCreating] = useState<{ parentRel: string; kind: 'file' | 'folder' } | null>(null)
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<{ rel: string; isDir: boolean } | null>(null)
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set())

  useEffect(() => {
    setSelected(null)
    setCollapsedDirs(new Set())
  }, [slug])

  // the editor's current text selection → a comment draft (Comments tab)
  const onComment = (): void => {
    if (openFilePath && selText.trim()) startComment(openFilePath, selText.trim())
  }

  const parentOf = (rel: string): string => rel.split('/').slice(0, -1).join('/')

  const createParent = (): string =>
    selected ? (selected.isDir ? selected.rel : parentOf(selected.rel)) : ''

  const isUnderCollapsedDir = (rel: string): boolean => {
    const segs = rel.split('/')
    for (let i = 1; i < segs.length; i++) {
      if (collapsedDirs.has(segs.slice(0, i).join('/'))) return true
    }
    return false
  }

  const toggleDir = (rel: string): void =>
    setCollapsedDirs((prev) => {
      const next = new Set(prev)
      if (!next.delete(rel)) next.add(rel)
      return next
    })

  const collapseAllDirs = (): void =>
    setCollapsedDirs(new Set(files.filter((f) => f.isDir).map((f) => f.rel)))

  const revealDir = (dir: string): void => {
    if (!dir) return
    const segs = dir.split('/')
    setCollapsedDirs((prev) => {
      const next = new Set(prev)
      for (let i = 1; i <= segs.length; i++) next.delete(segs.slice(0, i).join('/'))
      return next
    })
  }

  const openMenu = (
    e: React.MouseEvent,
    parentRel: string,
    target: { rel: string; isDir: boolean } | null
  ): void => {
    e.preventDefault()
    e.stopPropagation()
    // keep the menu inside the viewport when right-clicking near an edge
    const width = 190
    const height = (target ? 3 : 2) * 38 + 8
    const x = Math.max(8, Math.min(e.clientX, window.innerWidth - width - 8))
    const y = Math.max(8, Math.min(e.clientY, window.innerHeight - height - 8))
    setMenu({ x, y, parentRel, target })
  }

  const beginCreate = (kind: 'file' | 'folder', parentRel: string): void => {
    revealDir(parentRel)
    setCreating({ parentRel, kind })
    setName('')
    setMenu(null)
  }

  const submitCreate = (): void => {
    const n = name.trim()
    const c = creating
    setCreating(null)
    setName('')
    if (!c || !n) return
    const rel = c.parentRel ? `${c.parentRel}/${n}` : n
    if (c.kind === 'folder') void addStudioFolder(rel)
    else void addStudioFile(rel)
  }

  const here = (parentRel: string): string => (parentRel ? ` in ${parentRel}/` : '')

  const cancelCreate = (): void => {
    setCreating(null)
    setName('')
  }

  const creatingDepth = creating?.parentRel ? creating.parentRel.split('/').length : 0
  const createRow = creating && (
    <li className="studio-file-creating" style={{ paddingLeft: 8 + creatingDepth * 13 }}>
      <input
        autoFocus
        className="studio-file-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={cancelCreate}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submitCreate()
          }
          if (e.key === 'Escape') cancelCreate()
        }}
      />
    </li>
  )

  return (
    <div className={`studio-main-body ${filesOpen ? '' : 'files-closed'}`}>
      <div className="studio-files">
        <div className="studio-files-head">
          <button
            className={`studio-files-tab ${panel === 'files' ? 'is-active' : ''}`}
            onClick={() => setStudioPanel('files')}
            title="Files"
            aria-label="Files"
          >
            <FilesSectionIcon />
          </button>
          <button
            className={`studio-files-tab ${panel === 'changes' ? 'is-active' : ''}`}
            onClick={() => setStudioPanel('changes')}
            title="Changes"
            aria-label="Changes"
          >
            <ChangesIcon />
          </button>
          <button
            className="studio-files-tab"
            disabled={exporting}
            onClick={async () => {
              setExporting(true)
              try {
                await exportStudioPlugin()
              } finally {
                setExporting(false)
              }
            }}
            title="Export the plugin as a .zip to Downloads"
            aria-label="Export plugin"
          >
            <ExportIcon />
          </button>
        </div>
        {panel === 'changes' ? (
          <StudioChanges />
        ) : (
          <>
        <div className="studio-files-toolbar">
          <button
            className="btn-ghost btn-icon"
            onClick={() => beginCreate('file', createParent())}
            title="New file"
            aria-label="New file"
          >
            <NewFileIcon />
          </button>
          <button
            className="btn-ghost btn-icon"
            onClick={() => beginCreate('folder', createParent())}
            title="New folder"
            aria-label="New folder"
          >
            <NewFolderIcon />
          </button>
          <button
            className="btn-ghost btn-icon"
            onClick={() => void loadStudioFiles(slug)}
            title="Refresh files"
            aria-label="Refresh files"
          >
            <RefreshIcon />
          </button>
          <button
            className="btn-ghost btn-icon"
            onClick={collapseAllDirs}
            title="Collapse folders"
            aria-label="Collapse all folders"
          >
            <CollapseAllIcon />
          </button>
        </div>
        <ul className="studio-file-list" onContextMenu={(e) => openMenu(e, '', null)}>
          {files.length === 0 && !creating && (
            <li className="studio-file-hint">Right-click here to add a file or folder.</li>
          )}
          {creating?.parentRel === '' && createRow}
          {files
            .filter((f) => !isUnderCollapsedDir(f.rel))
            .map((f) => {
              const depth = f.rel.split('/').length - 1
              const base = f.rel.split('/').pop() ?? f.rel
              const indent = { paddingLeft: 8 + depth * 13 } as React.CSSProperties
              if (f.isDir) {
                return (
                  <Fragment key={f.rel}>
                    <li
                      className={`studio-file is-dir ${selected?.rel === f.rel ? 'is-selected' : ''}`}
                      style={indent}
                      onContextMenu={(e) => openMenu(e, f.rel, { rel: f.rel, isDir: true })}
                    >
                      <button
                        className="studio-file-dir"
                        onClick={() => {
                          setSelected({ rel: f.rel, isDir: true })
                          toggleDir(f.rel)
                        }}
                      >
                        <Chevron open={!collapsedDirs.has(f.rel)} />
                        {base}/
                      </button>
                    </li>
                    {creating?.parentRel === f.rel && createRow}
                  </Fragment>
                )
              }
              return (
                <li
                  key={f.rel}
                  className={`studio-file ${f.rel === openFilePath ? 'is-open' : ''} ${selected?.rel === f.rel ? 'is-selected' : ''}`}
                  style={indent}
                  onContextMenu={(e) => openMenu(e, parentOf(f.rel), { rel: f.rel, isDir: false })}
                >
                  <button
                    className="studio-file-name"
                    onClick={() => {
                      setSelected({ rel: f.rel, isDir: false })
                      void openStudioFile(f.rel)
                    }}
                  >
                    {base}
                  </button>
                  <button
                    className="studio-file-x"
                    title="Delete file"
                    aria-label={`Delete ${base}`}
                    onClick={() => void removeStudioFile(f.rel)}
                  >
                    <XIcon />
                  </button>
                </li>
              )
            })}
        </ul>
        {menu && (
          <>
            <div
              className="ctx-backdrop"
              onMouseDown={() => setMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu(null)
              }}
            />
            <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} role="menu">
              <button onClick={() => beginCreate('file', menu.parentRel)}>New file{here(menu.parentRel)}</button>
              <button onClick={() => beginCreate('folder', menu.parentRel)}>
                New folder{here(menu.parentRel)}
              </button>
              {menu.target && (
                <button
                  className="danger"
                  onClick={() => {
                    const rel = menu.target!.rel
                    setMenu(null)
                    void removeStudioFile(rel)
                  }}
                >
                  Delete {menu.target.isDir ? 'folder' : 'file'}
                </button>
              )}
            </div>
          </>
        )}
          </>
        )}
      </div>
      <div className="studio-editor">
        {studioDiff ? (
          <StudioDiff slug={slug} scope={studioDiff.scope} rels={studioDiff.rels} />
        ) : openFilePath ? (
          <>
            {inline && (
              <div className="suggest-bar">
                <span className="suggest-bar-glyph" aria-hidden>
                  ✦
                </span>
                <span className="suggest-bar-label">Claude suggests an edit</span>
                <button
                  className="btn-primary btn-small"
                  onClick={() => respondStudioPermission(inline.requestId, true)}
                  title="Accept  ⌘⏎"
                >
                  Accept
                </button>
                <button
                  className="btn-ghost btn-small"
                  onClick={() => respondStudioPermission(inline.requestId, false)}
                  title="Decline  esc"
                >
                  Decline
                </button>
              </div>
            )}
            <div className="studio-editor-head">
              <span className="studio-editor-path">{openFilePath}</span>
              <div className="studio-editor-head-right">
                <button
                  className="btn-ghost btn-small"
                  title="Comment on the selected text"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={onComment}
                >
                  Comment
                </button>
                {openFilePath.endsWith('.md') && (
                  <button
                    className="btn-ghost btn-small"
                    title="Auto-format this Markdown file (Prettier)"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      formatMarkdown(fileContent)
                        .then(setFileContent)
                        .catch((e) => reportError(e, 'Couldn’t format the file'))
                    }}
                  >
                    Auto-format
                  </button>
                )}
                <span className="studio-editor-status">{fileDirty ? 'Saving…' : 'Saved'}</span>
              </div>
            </div>
            <StudioCodeEditor
              key={openFilePath}
              path={openFilePath}
              scrollKey={`${slug}/${openFilePath}`}
              value={fileContent}
              revealPos={studioRevealPos}
              suggestion={inline?.segments ?? null}
              onChange={setFileContent}
              onSelect={setSelText}
            />
          </>
        ) : (
          <div className="studio-editor-empty">Select a file to edit, or create one.</div>
        )}
      </div>
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

function FilesIcon(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 4h10M3 8h10M3 12h7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ChangesIcon(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="4.5" cy="4" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="4.5" cy="12" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="11.5" cy="6" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.5 5.8v4.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M11.5 7.8c0 2.2-1.8 3-3.2 3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function ExportIcon(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 2.5v7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path
        d="M5.3 5.2 8 2.5l2.7 2.7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 9.5v2.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V9.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function FilesSectionIcon(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4.5 2.5h5L12.5 5.5V13a.5.5 0 0 1-.5.5H4.5a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M9.25 2.5V6h3.25" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

function NewFileIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M6 2.6h3.8L12.4 5.2V12a1 1 0 0 1-1 1H7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9.6 2.6v2.8h2.8" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M3.4 9.4v3.4M1.7 11.1h3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function NewFolderIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M6.4 5h1.2l1.1 1.4h4.3a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3.4 9.4v3.4M1.7 11.1h3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function RefreshIcon(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M12.5 8a4.5 4.5 0 1 1-1.3-3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path
        d="M12.7 2.8v2.4h-2.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CollapseAllIcon(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4.5 7.5 8 4.5l3.5 3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.5 11.5 8 8.5l3.5 3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Chevron({ open }: { open: boolean }): React.JSX.Element {
  return (
    <svg
      className={`studio-file-chevron ${open ? '' : 'is-collapsed'}`}
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
    >
      <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlusIcon(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 3.25v9.5M3.25 8h9.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function XIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4.25 4.25l7.5 7.5M11.75 4.25l-7.5 7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function PluginStudioIcon(): React.JSX.Element {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none" aria-hidden>
      <rect x="5" y="6" width="28" height="26" rx="6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 15.5h14M12 22.5h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path
        d="M27 21.5l3 3-3 3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
