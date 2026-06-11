import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChatItem, PermissionRequest } from '@shared/types'
import { useStore } from '@/store'
import DiffView from '@/components/DiffView'

export default function ChatPanel({ docId }: { docId: string }): React.JSX.Element {
  const chat = useStore((s) => s.chats[docId] ?? [])
  const allPermissions = useStore((s) => s.permissions)
  const permissions = useMemo(
    () => allPermissions.filter((p) => p.docId === docId),
    [allPermissions, docId]
  )
  const agent = useStore((s) => s.agent[docId])
  const pendingQuote = useStore((s) => s.pendingQuote)
  const setPendingQuote = useStore((s) => s.setPendingQuote)
  const askClaude = useStore((s) => s.askClaude)
  const interrupt = useStore((s) => s.interrupt)

  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const busy = agent?.status === 'starting' || agent?.status === 'working'

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat, permissions])

  useEffect(() => {
    if (pendingQuote) inputRef.current?.focus()
  }, [pendingQuote])

  const send = (): void => {
    if (!input.trim() || busy) return
    askClaude(input, pendingQuote ? { quote: pendingQuote } : {})
    setInput('')
  }

  return (
    <div className="chat">
      <div className="chat-scroll" ref={scrollRef}>
        {chat.length === 0 && (
          <div className="chat-empty">
            <p>
              Claude knows this document — it lives in the project folder Claude works from.
              Ask for a read-through, a rewrite, research, or a sharper opening line.
            </p>
            <p className="chat-empty-hint">
              Highlight any passage in the editor to comment on it or bring it here.
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
        {pendingQuote && (
          <div className="quote-chip">
            <span className="quote-chip-text">“{truncate(pendingQuote, 120)}”</span>
            <button onClick={() => setPendingQuote(null)} title="Remove quote">
              ×
            </button>
          </div>
        )}
        <div className="chat-inputrow">
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
          <button className="chat-send" onClick={send} disabled={busy || !input.trim()} title="Send">
            ↑
          </button>
        </div>
        <ModelPicker disabled={busy} />
      </div>
    </div>
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
