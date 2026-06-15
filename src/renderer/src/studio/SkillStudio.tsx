import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { formatMarkdown } from '@/lib/markdown'
import WorkspaceSwitcher from '@/studio/WorkspaceSwitcher'
import StudioSidebar from '@/studio/StudioSidebar'
import StudioCodeEditor from '@/studio/StudioCodeEditor'

/**
 * The Skill Studio surface — a separate top-level workspace (mode === 'skillStudio'),
 * laid out to mirror the writing app: a collapsible left rail (whose top-left brand is
 * the same ❡ logo dropdown that switches workspaces), an editor column with its own
 * header + rail toggle, and the jailed test thread. App.tsx branches here on mode.
 */
export default function SkillStudio(): React.JSX.Element {
  const activeSkill = useStore((s) => s.activeSkill)
  const railOpen = useStore((s) => s.studioRailOpen)
  const toggleStudioRail = useStore((s) => s.toggleStudioRail)
  const loadStudioSkills = useStore((s) => s.loadStudioSkills)

  useEffect(() => {
    void loadStudioSkills()
  }, [loadStudioSkills])

  return (
    <div className={`studio ${railOpen ? '' : 'rail-closed'}`}>
      <SkillRail />
      <main className={`studio-main ${activeSkill ? '' : 'full'}`}>
        <header className={`workspace-header ${railOpen ? '' : 'with-lights'}`}>
          <div className="workspace-title">
            <button
              className="btn-ghost btn-icon"
              onClick={toggleStudioRail}
              title="Toggle skills  ⌘\"
            >
              <RailIcon />
            </button>
            {activeSkill && <h1>{activeSkill}</h1>}
          </div>
          {activeSkill && (
            <div className="workspace-actions">
              <button
                className="btn-ghost"
                onClick={() => window.fabulist.skillStudio.reveal(activeSkill)}
                title="Reveal the skill plugin folder in Finder"
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
        <span className="empty-state-glyph">⚒</span>
        <h2>Build a skill, test it on the spot.</h2>
        <p>
          Each skill is its own real Claude plugin under <code>.skill-studio/</code> — with its own{' '}
          <code>skills/</code>, <code>agents/</code>, and <code>.mcp.json</code>. Create one on the
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
        <span className="library-label">Skills</span>
        <button className="library-new" onClick={() => setCreating(true)} title="New skill">
          +
        </button>
      </div>
      {creating && (
        <div className="library-create">
          <input
            autoFocus
            value={name}
            placeholder="Skill name"
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
          <div className="library-empty">No skills yet. Click + to create your first one.</div>
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
              title="Delete skill"
              onClick={() => setConfirmDel(s.slug)}
            >
              ✕
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
  void slug
  const files = useStore((s) => s.studioFiles)
  const openFilePath = useStore((s) => s.openFilePath)
  const fileContent = useStore((s) => s.fileContent)
  const fileDirty = useStore((s) => s.fileDirty)
  const openStudioFile = useStore((s) => s.openStudioFile)
  const setFileContent = useStore((s) => s.setFileContent)
  const addStudioFile = useStore((s) => s.addStudioFile)
  const addStudioFolder = useStore((s) => s.addStudioFolder)
  const removeStudioFile = useStore((s) => s.removeStudioFile)
  const startComment = useStore((s) => s.startComment)
  const reportError = useStore((s) => s.reportError)
  const [selText, setSelText] = useState('')

  // right-click menu (create here / delete) and the inline name input it opens
  const [menu, setMenu] = useState<{
    x: number
    y: number
    parentRel: string
    target: { rel: string; isDir: boolean } | null
  } | null>(null)
  const [creating, setCreating] = useState<{ parentRel: string; kind: 'file' | 'folder' } | null>(null)
  const [name, setName] = useState('')

  // the editor's current text selection → a comment draft (Comments tab)
  const onComment = (): void => {
    if (openFilePath && selText.trim()) startComment(openFilePath, selText.trim())
  }

  const parentOf = (rel: string): string => rel.split('/').slice(0, -1).join('/')

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

  const beginCreate = (kind: 'file' | 'folder'): void => {
    setCreating({ parentRel: menu?.parentRel ?? '', kind })
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

  return (
    <div className="studio-main-body">
      <div className="studio-files">
        <div className="studio-files-head">
          <span className="library-label">Files</span>
          <button
            className="library-new"
            onClick={() => {
              setCreating({ parentRel: '', kind: 'file' })
              setName('')
            }}
            title="New file (right-click a folder to add inside it)"
          >
            +
          </button>
        </div>
        {creating && (
          <div className="studio-files-create">
            <div className="studio-files-create-where">
              New {creating.kind} in <code>{creating.parentRel || '/'}</code>
            </div>
            <input
              autoFocus
              value={name}
              placeholder={creating.kind === 'folder' ? 'folder name' : 'file name (e.g. reviewer.md)'}
              onChange={(e) => setName(e.target.value)}
              // blur dismisses (clicking away cancels); Enter creates, Escape cancels
              onBlur={() => {
                setCreating(null)
                setName('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submitCreate()
                }
                if (e.key === 'Escape') {
                  setCreating(null)
                  setName('')
                }
              }}
            />
          </div>
        )}
        <ul className="studio-file-list" onContextMenu={(e) => openMenu(e, '', null)}>
          {files.length === 0 && (
            <li className="studio-file-hint">Right-click here to add a file or folder.</li>
          )}
          {files.map((f) => {
            const depth = f.rel.split('/').length - 1
            const base = f.rel.split('/').pop() ?? f.rel
            const indent = { paddingLeft: 8 + depth * 13 } as React.CSSProperties
            if (f.isDir) {
              return (
                <li
                  key={f.rel}
                  className="studio-file is-dir"
                  style={indent}
                  onContextMenu={(e) => openMenu(e, f.rel, { rel: f.rel, isDir: true })}
                >
                  <span className="studio-file-dir">{base}/</span>
                </li>
              )
            }
            return (
              <li
                key={f.rel}
                className={`studio-file ${f.rel === openFilePath ? 'is-open' : ''}`}
                style={indent}
                onContextMenu={(e) => openMenu(e, parentOf(f.rel), { rel: f.rel, isDir: false })}
              >
                <button className="studio-file-name" onClick={() => void openStudioFile(f.rel)}>
                  {base}
                </button>
                <button
                  className="studio-file-x"
                  title="Delete file"
                  onClick={() => void removeStudioFile(f.rel)}
                >
                  ✕
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
              <button onClick={() => beginCreate('file')}>New file{here(menu.parentRel)}</button>
              <button onClick={() => beginCreate('folder')}>New folder{here(menu.parentRel)}</button>
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
      </div>
      <div className="studio-editor">
        {openFilePath ? (
          <>
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
              value={fileContent}
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
