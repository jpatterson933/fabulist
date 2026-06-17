import { useEffect, useMemo, useRef, useState } from 'react'
import type { Attachment, ChatItem, PermissionRequest } from '@shared/types'
import { useStore } from '@/store'
import DiffView from '@/components/DiffView'
import Markdown from '@/components/Markdown'
import { relativeTime } from '@/components/Library'

export default function ChatPanel({ docId }: { docId: string }): React.JSX.Element {
  const threadId = useStore((s) => s.activeThread[docId])
  const chat = useStore((s) => (threadId ? s.chats[threadId] ?? [] : []))
  const allPermissions = useStore((s) => s.permissions)
  const permissions = useMemo(
    () => allPermissions.filter((p) => p.docId === docId),
    [allPermissions, docId]
  )
  const agent = useStore((s) => s.agent[docId])
  const askClaude = useStore((s) => s.askClaude)
  const interrupt = useStore((s) => s.interrupt)

  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [dragging, setDragging] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const busy = agent?.status === 'starting' || agent?.status === 'working'

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat, permissions])

  const addAttachments = (next: Attachment[]): void => {
    if (next.length === 0) return
    setAttachments((cur) => {
      const seen = new Set(cur.map((a) => a.path))
      return [...cur, ...next.filter((a) => !seen.has(a.path))]
    })
  }

  const pickAttachments = async (): Promise<void> => {
    const picked = await window.fabulist.agent.pickAttachments()
    addAttachments(picked)
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragging(false)
    if (busy) return
    const dropped: Attachment[] = Array.from(e.dataTransfer.files).map((f) => ({
      path: window.fabulist.agent.attachmentPathForFile(f),
      name: f.name
    }))
    addAttachments(dropped.filter((a) => a.path))
  }

  const send = (): void => {
    if (busy || (!input.trim() && attachments.length === 0)) return
    askClaude(input, attachments.length ? { attachments } : {})
    setInput('')
    setAttachments([])
  }

  return (
    <div
      className={`chat${dragging ? ' chat-dragging' : ''}`}
      onDragOver={(e) => {
        if (busy) return
        e.preventDefault()
        if (!dragging) setDragging(true)
      }}
      onDragLeave={(e) => {
        // only clear when the pointer actually leaves the panel
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={onDrop}
    >
      {dragging && <div className="chat-dropzone">Drop files to attach</div>}
      <ThreadBar docId={docId} busy={busy} />
      <div className="chat-scroll" ref={scrollRef}>
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
          <div className="chat-attachments">
            {attachments.map((a) => (
              <span key={a.path} className="attachment-chip" title={a.path}>
                <span className="attachment-name">{a.name}</span>
                <button
                  className="attachment-remove"
                  title="Remove"
                  onClick={() => setAttachments((cur) => cur.filter((x) => x.path !== a.path))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="chat-inputrow">
          <button
            className="chat-attach"
            onClick={() => void pickAttachments()}
            disabled={busy}
            title="Attach files"
          >
            📎
          </button>
          <textarea
            ref={inputRef}
            rows={Math.min(6, Math.max(1, input.split('\n').length))}
            value={input}
            placeholder={busy ? 'Claude is working…' : 'Ask Claude about this document…'}
            disabled={busy}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
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
        <div className="compose-footer">
          <ModelPicker disabled={busy} />
          <AutoApproveToggle />
        </div>
      </div>
    </div>
  )
}

function ThreadBar({ docId, busy }: { docId: string; busy: boolean }): React.JSX.Element {
  const threads = useStore((s) => s.agentThreads[docId] ?? [])
  const activeThreadId = useStore((s) => s.activeThread[docId])
  const createThread = useStore((s) => s.createAgentThread)
  const selectThread = useStore((s) => s.selectAgentThread)
  const renameThread = useStore((s) => s.renameAgentThread)
  const deleteThread = useStore((s) => s.deleteAgentThread)

  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const active = threads.find((t) => t.id === activeThreadId)
  const ordered = useMemo(() => [...threads].sort((a, b) => b.updatedAt - a.updatedAt), [threads])

  useEffect(() => {
    if (!open) {
      setRenaming(null)
      setConfirmDelete(null)
    }
  }, [open])

  const commitRename = (id: string): void => {
    const t = draft.trim()
    setRenaming(null)
    if (t) void renameThread(id, t)
  }

  return (
    <div className="thread-bar">
      <button
        className="thread-current"
        onClick={() => setOpen((o) => !o)}
        title="Switch conversation"
      >
        <span className="thread-current-title">{active?.title ?? 'Conversation'}</span>
        <svg className="thread-caret" width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        className="thread-new"
        title="New conversation"
        disabled={busy}
        onClick={() => void createThread()}
      >
        ＋
      </button>

      {open && (
        <>
          <div className="thread-scrim" onClick={() => setOpen(false)} />
          <div className="thread-menu">
            {ordered.map((t) => (
              <div
                key={t.id}
                className={`thread-row ${t.id === activeThreadId ? 'is-active' : ''}`}
              >
                {renaming === t.id ? (
                  <input
                    className="thread-rename-input"
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commitRename(t.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(t.id)
                      if (e.key === 'Escape') setRenaming(null)
                    }}
                  />
                ) : (
                  <button
                    className="thread-row-main"
                    onClick={() => {
                      void selectThread(t.id)
                      setOpen(false)
                    }}
                    onDoubleClick={() => {
                      setDraft(t.title)
                      setRenaming(t.id)
                    }}
                  >
                    <span className="thread-row-title">{t.title}</span>
                    <span className="thread-row-meta">
                      {relativeTime(t.updatedAt)}
                      {t.messageCount > 0 && ` · ${t.messageCount} msg`}
                    </span>
                  </button>
                )}

                {renaming !== t.id &&
                  (confirmDelete === t.id ? (
                    <div className="thread-row-confirm">
                      <button
                        className="danger"
                        onClick={() => {
                          setConfirmDelete(null)
                          void deleteThread(t.id)
                        }}
                      >
                        Delete
                      </button>
                      <button onClick={() => setConfirmDelete(null)}>Keep</button>
                    </div>
                  ) : (
                    <div className="thread-row-actions">
                      <button
                        className="thread-row-icon"
                        title="Rename"
                        onClick={() => {
                          setDraft(t.title)
                          setRenaming(t.id)
                        }}
                      >
                        ✎
                      </button>
                      <button
                        className="thread-row-icon"
                        title="Delete conversation"
                        disabled={busy}
                        onClick={() => setConfirmDelete(t.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </>
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
      title="Apply Claude's document edits automatically. Bash commands still ask first."
    >
      <input
        type="checkbox"
        checked={autoApprove}
        onChange={(e) => setAutoApprove(e.target.checked)}
      />
      Auto-accept edits
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
  if (item.role === 'user') {
    return (
      <div className="bubble bubble-user">
        {item.quote && <div className="bubble-quote">“{truncate(item.quote, 160)}”</div>}
        {item.attachments && item.attachments.length > 0 && (
          <div className="bubble-attachments">
            {item.attachments.map((name, i) => (
              <span key={i} className="attachment-chip attachment-chip-static">
                <span className="attachment-name">{name}</span>
              </span>
            ))}
          </div>
        )}
        {item.text && <div className="bubble-text">{item.text}</div>}
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
            <Markdown text={item.text} streaming={item.streaming} />
            {item.streaming && <span className="caret-blink">▍</span>}
          </div>
        )
      )}
    </div>
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
