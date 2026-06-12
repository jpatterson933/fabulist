import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChatItem, DocSkill, PermissionRequest } from '@shared/types'
import { useStore } from '@/store'
import DiffView from '@/components/DiffView'
import SkillsPanel from '@/components/SkillsPanel'

/** The `/name` token the caret is inside, if any — start/end are offsets into the text. */
function slashTokenAt(text: string, caret: number): { start: number; query: string } | null {
  const m = text.slice(0, caret).match(/(?:^|\s)(\/[a-z0-9-]*)$/i)
  if (!m) return null
  return { start: caret - m[1].length, query: m[1].slice(1) }
}

export default function ChatPanel({ docId }: { docId: string }): React.JSX.Element {
  const chat = useStore((s) => s.chats[docId] ?? [])
  const allPermissions = useStore((s) => s.permissions)
  const permissions = useMemo(
    () => allPermissions.filter((p) => p.docId === docId),
    [allPermissions, docId]
  )
  const agent = useStore((s) => s.agent[docId])
  const askClaude = useStore((s) => s.askClaude)
  const interrupt = useStore((s) => s.interrupt)

  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [skills, setSkills] = useState<DocSkill[]>([])
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [slash, setSlash] = useState<{ start: number; query: string } | null>(null)
  const [slashSel, setSlashSel] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // follow new output only while the user is at (or near) the bottom —
  // scrolling up to read pauses the auto-scroll until they return
  const stickToBottom = useRef(true)

  const busy = agent?.status === 'starting' || agent?.status === 'working'

  const refreshSkills = useCallback(() => {
    window.fabulist.skills
      .listForDoc(docId)
      .then(setSkills)
      .catch(() => setSkills([]))
  }, [docId])

  useEffect(refreshSkills, [refreshSkills])

  useEffect(() => {
    const el = scrollRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [chat, permissions])

  const send = (): void => {
    if ((!input.trim() && attachments.length === 0) || busy) return
    const prompt =
      attachments.length === 0
        ? input
        : `${input.trim()}\n\nAttached files (read them from this project folder):\n${attachments
            .map((p) => `- ${p}`)
            .join('\n')}`
    stickToBottom.current = true // sending always jumps to the latest
    askClaude(prompt)
    setInput('')
    setAttachments([])
    setSlash(null)
  }

  // --- `/` autocomplete over the skills enabled for this document ---

  const matches = useMemo(() => {
    if (slash === null) return []
    const q = slash.query.toLowerCase()
    return skills
      .filter((s) => s.enabled)
      .filter((s) => s.skill.slug.includes(q) || s.skill.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [skills, slash])

  // matches plus the trailing "Manage skills…" row
  const menuLength = slash === null ? 0 : matches.length + 1

  const syncSlash = (text: string, caret: number): void => {
    const token = slashTokenAt(text, caret)
    setSlash(token)
    if (token?.query !== slash?.query) setSlashSel(0)
  }

  const pickSlash = (index: number): void => {
    if (slash === null) return
    if (index >= matches.length) {
      setSkillsOpen(true)
      setSlash(null)
      return
    }
    const el = inputRef.current
    const caret = el?.selectionStart ?? input.length
    const inserted = `/${matches[index].skill.slug} `
    const next = input.slice(0, slash.start) + inserted + input.slice(caret)
    setInput(next)
    setSlash(null)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(slash.start + inserted.length, slash.start + inserted.length)
    })
  }

  // pastes longer than this become an attachment chip, not inline text
  const PASTE_ATTACH_THRESHOLD = 500

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    const text = e.clipboardData.getData('text/plain')
    if (text.length <= PASTE_ATTACH_THRESHOLD) return
    e.preventDefault()
    void window.fabulist.doc
      .attachText(docId, text)
      .then((path) => setAttachments((cur) => [...cur, path]))
      .catch(() => {
        // fall back to a plain inline paste
        document.execCommand('insertText', false, text)
      })
  }

  const attachFiles = async (): Promise<void> => {
    const paths = await window.fabulist.doc.attachFiles(docId).catch(() => [])
    if (paths.length === 0) return
    setAttachments((cur) => [...cur, ...paths])
    inputRef.current?.focus()
  }

  const removeAttachment = (path: string): void => {
    setAttachments((cur) => cur.filter((p) => p !== path))
    void window.fabulist.doc.removeAttachment(docId, path).catch(() => {})
  }

  return (
    <div className="chat">
      <div
        className="chat-scroll"
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
        }}
      >
        {chat.length === 0 && (
          <div className="chat-empty">
            <p>
              Claude knows this document — it lives in the project folder Claude works from.
              Ask for a read-through, a rewrite, research, or a sharper opening line.
            </p>
            <p className="chat-empty-hint">
              Or highlight any passage and comment on it — Claude reads every comment and
              replies in the thread.
            </p>
          </div>
        )}
        {chat.map((item) => (
          <ChatBubble key={item.id} item={item} />
        ))}
        {permissions.map((p) => (
          <ApprovalCard key={p.requestId} request={p} />
        ))}
        {busy && (
          <div className="chat-working">
            <span className="agent-dot agent-working" />
            {agent?.detail ? agent.detail : 'Claude is working'}
            <button className="btn-ghost btn-small" onClick={interrupt}>
              Stop
            </button>
          </div>
        )}
      </div>

      <div className="chat-compose">
        {attachments.length > 0 && (
          <div className="attach-chips">
            {attachments.map((p) => (
              <span key={p} className="attach-chip" title={p}>
                <span className="attach-chip-name">{p.replace(/^attachments\//, '')}</span>
                <button onClick={() => removeAttachment(p)} title="Remove attachment">
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="chat-inputrow">
          {slash !== null && (
            <div className="slash-menu" role="listbox">
              {matches.map((s, i) => (
                <button
                  key={s.skill.slug}
                  className={`slash-item${i === slashSel ? ' is-selected' : ''}`}
                  onMouseEnter={() => setSlashSel(i)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pickSlash(i)
                  }}
                >
                  <span className="slash-item-name">/{s.skill.slug}</span>
                  {s.skill.description && (
                    <span className="slash-item-desc">{s.skill.description}</span>
                  )}
                </button>
              ))}
              <button
                className={`slash-item slash-item-manage${slashSel === matches.length ? ' is-selected' : ''}`}
                onMouseEnter={() => setSlashSel(matches.length)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pickSlash(matches.length)
                }}
              >
                Manage skills…
              </button>
            </div>
          )}
          <textarea
            ref={inputRef}
            rows={Math.min(6, Math.max(1, input.split('\n').length))}
            value={input}
            placeholder={busy ? 'Claude is working…' : 'Ask Claude about this document…'}
            disabled={busy}
            onChange={(e) => {
              setInput(e.target.value)
              syncSlash(e.target.value, e.target.selectionStart ?? e.target.value.length)
            }}
            onClick={(e) => syncSlash(input, e.currentTarget.selectionStart ?? input.length)}
            onBlur={() => setSlash(null)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (slash !== null && menuLength > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  return setSlashSel((v) => (v + 1) % menuLength)
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  return setSlashSel((v) => (v + menuLength - 1) % menuLength)
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault()
                  return pickSlash(slashSel)
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  return setSlash(null)
                }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          <button
            className="chat-send"
            onClick={send}
            disabled={busy || (!input.trim() && attachments.length === 0)}
            title="Send"
          >
            ↑
          </button>
        </div>
        <div className="chat-options">
          <ModelPicker disabled={busy} />
          <PlusMenu onManageSkills={() => setSkillsOpen(true)} onAttachFiles={attachFiles} />
          <AutoApproveToggle />
        </div>
      </div>

      {skillsOpen && (
        <div
          className="modal-overlay"
          onClick={() => {
            setSkillsOpen(false)
            refreshSkills()
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span className="modal-title">Skills</span>
              <button
                className="btn-ghost btn-small"
                onClick={() => {
                  setSkillsOpen(false)
                  refreshSkills()
                }}
              >
                ✕
              </button>
            </div>
            <SkillsPanel docId={docId} />
          </div>
        </div>
      )}
    </div>
  )
}

function PlusMenu(props: {
  onManageSkills: () => void
  onAttachFiles: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="plus-menu">
      <button
        className="plus-button"
        title="Add skills or attach files"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      >
        +
      </button>
      {open && (
        <div className="plus-menu-pop">
          <button
            onMouseDown={(e) => {
              e.preventDefault()
              setOpen(false)
              props.onAttachFiles()
            }}
          >
            Attach file…
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault()
              setOpen(false)
              props.onManageSkills()
            }}
          >
            Manage skills…
          </button>
        </div>
      )}
    </div>
  )
}

function AutoApproveToggle(): React.JSX.Element {
  const autoApprove = useStore((s) => s.autoApprove)
  const setAutoApprove = useStore((s) => s.setAutoApprove)
  return (
    <label
      className="auto-approve"
      title="Apply Claude's edits to this document immediately, without approval cards. Commands still ask. Every run is committed, so History can undo anything."
    >
      <input
        type="checkbox"
        checked={autoApprove}
        onChange={(e) => setAutoApprove(e.target.checked)}
      />
      Auto-apply edits
    </label>
  )
}

function ModelPicker({ disabled }: { disabled: boolean }): React.JSX.Element {
  const model = useStore((s) => s.model)
  const models = useStore((s) => s.models)
  const setModel = useStore((s) => s.setModel)

  // a stored value the engine no longer lists (e.g. saved before a CLI update)
  // still renders, so the selection isn't silently misrepresented
  const options = models.some((m) => m.value === model)
    ? models
    : [...models, { value: model, label: model, hint: 'no longer listed by the CLI' }]
  const current = options.find((m) => m.value === model) ?? options[0]

  return (
    <div className="model-picker">
      <label htmlFor="model-select">Model</label>
      <select
        id="model-select"
        value={current.value}
        disabled={disabled}
        title={disabled ? 'Takes effect on the next message' : current.hint}
        onChange={(e) => setModel(e.target.value)}
      >
        {options.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function ChatBubble({ item }: { item: ChatItem }): React.JSX.Element {
  if (item.edit) return <AppliedEditCard item={item} />
  if (item.role === 'user') {
    return (
      <div className="bubble bubble-user">
        {item.quote && <div className="bubble-quote">“{truncate(item.quote, 160)}”</div>}
        <div className="bubble-text">{item.text}</div>
      </div>
    )
  }
  return (
    <div className="bubble bubble-claude">
      {item.toolNotes && item.toolNotes.length > 0 && (
        <div className="tool-notes">
          {item.toolNotes.map((n) => (
            <div key={n.toolId} className={`tool-note ${n.done ? (n.ok ? 'ok' : 'bad') : 'live'}`}>
              <span className="tool-note-dot" />
              {n.note}
            </div>
          ))}
        </div>
      )}
      {item.error ? (
        <div className="bubble-error">{item.error}</div>
      ) : (
        item.text && (
          <div className="bubble-text">
            {item.text}
            {item.streaming && <span className="caret-blink">▍</span>}
          </div>
        )
      )}
    </div>
  )
}

function AppliedEditCard({ item }: { item: ChatItem }): React.JSX.Element {
  const revealEdit = useStore((s) => s.revealEdit)
  const edit = item.edit!
  const isDoc = edit.filePath === 'document.md'
  return (
    <details className="applied-edit">
      <summary>
        <span className="applied-edit-label">
          ✦ Edited {edit.filePath ?? 'files'}
        </span>
        {isDoc && (
          <button
            className="btn-ghost btn-small"
            onClick={(e) => {
              e.preventDefault()
              revealEdit(edit)
            }}
          >
            Show in document
          </button>
        )}
      </summary>
      <div className="approval-diff">
        <DiffView
          before={edit.before}
          after={edit.after}
          mode={edit.tool === 'Write' ? 'lines' : 'words'}
        />
      </div>
    </details>
  )
}

function ApprovalCard({ request }: { request: PermissionRequest }): React.JSX.Element {
  const respond = useStore((s) => s.respondPermission)
  const shownInline = useStore((s) => s.inlineSuggestionId === request.requestId)
  const isDocEdit = request.filePath === 'document.md'
  const isWholeFile = request.tool === 'Write'

  // the suggestion is rendered in the document itself — keep chat compact
  if (shownInline) {
    return (
      <div className="approval approval-inline">
        <div className="approval-head">
          <span className="approval-kind">Suggested edit — shown in the document</span>
          <span className="approval-tool">{request.tool}</span>
        </div>
        <div className="approval-actions">
          <button className="btn-primary" onClick={() => respond(request.requestId, true)}>
            Accept
          </button>
          <button className="btn-ghost" onClick={() => respond(request.requestId, false)}>
            Decline
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="approval">
      <div className="approval-head">
        <span className="approval-kind">
          {request.command ? 'Run command' : isDocEdit ? 'Edit document' : `Change ${request.filePath ?? 'files'}`}
        </span>
        <span className="approval-tool">{request.tool}</span>
      </div>

      {request.command ? (
        <pre className="approval-command">{request.command}</pre>
      ) : request.before !== undefined || request.after !== undefined ? (
        <div className="approval-diff">
          <DiffView
            before={request.before ?? ''}
            after={request.after ?? ''}
            mode={isWholeFile ? 'lines' : 'words'}
          />
        </div>
      ) : (
        <p className="approval-summary">{request.summary}</p>
      )}

      <div className="approval-actions">
        <button className="btn-primary" onClick={() => respond(request.requestId, true)}>
          Apply
        </button>
        <button className="btn-ghost" onClick={() => respond(request.requestId, false)}>
          Decline
        </button>
      </div>
    </div>
  )
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}
