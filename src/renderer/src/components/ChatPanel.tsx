import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChatItem, DocSkill, PermissionRequest } from '@shared/types'
import { useStore } from '@/store'
import DiffView from '@/components/DiffView'
import SkillsPanel from '@/components/SkillsPanel'
import { AttachChips, useAttachments } from '@/lib/useAttachments'

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
  const attachments = useAttachments(docId)
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

  // a new approval card must never sit out of sight below the fold —
  // jump to it even if the user had scrolled up to read
  const prevPermCount = useRef(0)
  useEffect(() => {
    if (permissions.length > prevPermCount.current) stickToBottom.current = true
    prevPermCount.current = permissions.length
    const el = scrollRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [chat, permissions])

  const send = (): void => {
    if ((!input.trim() && attachments.paths.length === 0) || busy) return
    stickToBottom.current = true // sending always jumps to the latest
    askClaude(attachments.consume(input))
    setInput('')
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

  const attachFiles = async (): Promise<void> => {
    const paths = await window.fabulist.doc.attachFiles(docId).catch(() => [])
    if (paths.length === 0) return
    attachments.add(paths)
    inputRef.current?.focus()
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
        {groupConsecutiveEdits(chat).map((row) =>
          Array.isArray(row) ? (
            <EditGroupCard key={row[0].id} items={row} />
          ) : (
            <ChatBubble key={row.id} item={row} />
          )
        )}
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
        <AttachChips attachments={attachments} />
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
            onPaste={attachments.onPaste}
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
            disabled={busy || (!input.trim() && attachments.paths.length === 0)}
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

/** Runs of back-to-back applied edits become one collapsible group; everything else passes through. */
function groupConsecutiveEdits(chat: ChatItem[]): (ChatItem | ChatItem[])[] {
  const out: (ChatItem | ChatItem[])[] = []
  for (const item of chat) {
    const last = out[out.length - 1]
    if (item.edit && Array.isArray(last)) last.push(item)
    else if (item.edit && last && !Array.isArray(last) && last.edit) out[out.length - 1] = [last, item]
    else out.push(item)
  }
  return out
}

function EditGroupCard({ items }: { items: ChatItem[] }): React.JSX.Element {
  const files = [...new Set(items.map((i) => i.edit!.filePath ?? 'files'))]
  const label = files.length === 1 ? files[0] : `${files.length} files`
  return (
    <details className="applied-edit applied-edit-group">
      <summary>
        <span className="applied-edit-label">
          ✦ Edited {label} — {items.length} edits
        </span>
      </summary>
      <div className="applied-edit-group-items">
        {items.map((item) => (
          <AppliedEditCard key={item.id} item={item} />
        ))}
      </div>
    </details>
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

function QuestionCard({ request }: { request: PermissionRequest }): React.JSX.Element {
  const respond = useStore((s) => s.respondPermission)
  const questions = request.questions!
  const [picked, setPicked] = useState<Record<string, string[]>>({})

  const submit = (sel: Record<string, string[]>): void => {
    const answers = Object.fromEntries(
      questions.map((q) => [q.question, (sel[q.question] ?? []).join(', ')])
    )
    respond(request.requestId, true, answers)
  }

  const toggle = (q: (typeof questions)[number], label: string): void => {
    const next = { ...picked }
    const cur = next[q.question] ?? []
    if (q.multiSelect) {
      next[q.question] = cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label]
    } else {
      next[q.question] = [label]
      // a lone single-choice question answers on click — no extra Send step
      if (questions.length === 1) return submit(next)
    }
    setPicked(next)
  }

  const complete = questions.every((q) => (picked[q.question] ?? []).length > 0)

  return (
    <div className="approval approval-question">
      <div className="approval-head">
        <span className="approval-kind">Claude is asking</span>
        <span className="approval-tool">{request.tool}</span>
      </div>
      {questions.map((q) => (
        <div key={q.question} className="question-block">
          {q.header && <span className="question-chip">{q.header}</span>}
          <p className="question-text">{q.question}</p>
          <div className="question-options">
            {q.options.map((o) => {
              const on = (picked[q.question] ?? []).includes(o.label)
              return (
                <button
                  key={o.label}
                  className={`question-option${on ? ' is-picked' : ''}`}
                  title={o.description}
                  onClick={() => toggle(q, o.label)}
                >
                  <span className="question-option-label">{o.label}</span>
                  {o.description && (
                    <span className="question-option-desc">{o.description}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <div className="approval-actions">
        {(questions.length > 1 || questions.some((q) => q.multiSelect)) && (
          <button className="btn-primary" disabled={!complete} onClick={() => submit(picked)}>
            Send answers
          </button>
        )}
        <button className="btn-ghost" onClick={() => respond(request.requestId, false)}>
          Skip
        </button>
      </div>
    </div>
  )
}

function ApprovalCard({ request }: { request: PermissionRequest }): React.JSX.Element {
  const respond = useStore((s) => s.respondPermission)
  const shownInline = useStore((s) => s.inlineSuggestionId === request.requestId)

  if (request.questions) return <QuestionCard request={request} />
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
