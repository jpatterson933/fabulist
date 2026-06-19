import { Fragment, useEffect, useMemo, useState } from 'react'
import type { PermissionRequest } from '@shared/types'
import { useStore } from '@/store'
import { formatForPath } from '@/lib/markdown'
import { studioInlineEdit } from '@/studio/inlineEdit'
import WorkspaceSwitcher from '@/studio/WorkspaceSwitcher'
import StudioSidebar from '@/studio/StudioSidebar'
import StudioCodeEditor from '@/studio/StudioCodeEditor'
import StudioChanges from '@/studio/StudioChanges'
import StudioDiff from '@/studio/StudioDiff'
import {
  Rail,
  FileTypeLightTree,
  Files,
  GitBranch,
  Export,
  NewFile,
  NewFolder,
  Refresh,
  CollapseAll,
  Chevron,
  Plus,
  Close,
  PluginStudio
} from '@/studio/icons'

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
  const toggleStudioWrap = useStore((s) => s.toggleStudioWrap)
  const loadStudioSkills = useStore((s) => s.loadStudioSkills)

  useEffect(() => {
    void loadStudioSkills()
  }, [loadStudioSkills])

  // ⌥Z flips line-wrapping app-wide for the editor + diff view. `e.code` is keyboard-
  // layout-independent, so we match the physical Z key rather than the 'Ω' that Option+Z
  // emits on macOS; preventDefault keeps that character out of any focused input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.altKey && !e.metaKey && !e.ctrlKey && e.code === 'KeyZ') {
        e.preventDefault()
        toggleStudioWrap()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleStudioWrap])

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
              <Rail width={15} height={15} />
            </button>
            {activeSkill && (
              <button className="btn-ghost btn-icon" onClick={toggleStudioFiles} title="Toggle files">
                <FileTypeLightTree width={15} height={15} />
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
          <PluginStudio />
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
          <Plus width={15} height={15} />
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
              <Close width={14} height={14} />
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
            <Files width={15} height={15} />
          </button>
          <button
            className={`studio-files-tab ${panel === 'changes' ? 'is-active' : ''}`}
            onClick={() => setStudioPanel('changes')}
            title="Changes"
            aria-label="Changes"
          >
            <GitBranch width={15} height={15} />
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
            <Export width={15} height={15} />
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
            <NewFile width={16} height={16} />
          </button>
          <button
            className="btn-ghost btn-icon"
            onClick={() => beginCreate('folder', createParent())}
            title="New folder"
            aria-label="New folder"
          >
            <NewFolder width={16} height={16} />
          </button>
          <button
            className="btn-ghost btn-icon"
            onClick={() => void loadStudioFiles(slug)}
            title="Refresh files"
            aria-label="Refresh files"
          >
            <Refresh width={15} height={15} />
          </button>
          <button
            className="btn-ghost btn-icon"
            onClick={collapseAllDirs}
            title="Collapse folders"
            aria-label="Collapse all folders"
          >
            <CollapseAll width={15} height={15} />
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
                    <Close width={14} height={14} />
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
                {(openFilePath.endsWith('.md') || openFilePath.endsWith('.json')) && (
                  <button
                    className="btn-ghost btn-small"
                    title={`Auto-format this ${openFilePath.endsWith('.json') ? 'JSON' : 'Markdown'} file (Prettier)`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      formatForPath(openFilePath, fileContent)
                        ?.then(setFileContent)
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
