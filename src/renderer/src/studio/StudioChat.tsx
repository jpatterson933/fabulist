import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { selectAuthChat } from '@/store/selectors'
import { ChatBubble } from '@/components/chat/Messages'
import { usageLine } from '@/lib/format'

/**
 * The main chat with the skill — an authoring agent that reads and edits the skill's
 * files directly (its edits stream here as diff cards and land in the editor). Reuses
 * the document chat's bubble/diff renderers.
 */
export default function StudioChat({ slug }: { slug: string }): React.JSX.Element {
  const chat = useStore(selectAuthChat(slug))
  const usage = useStore((s) => s.authUsage[slug])
  const status = useStore((s) => s.authAgent[slug])
  const authSend = useStore((s) => s.authSend)
  const interruptAuth = useStore((s) => s.interruptAuth)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const busy = status === 'starting' || status === 'working'

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat, status])

  const send = (): void => {
    if (!input.trim() || busy) return
    void authSend(input)
    setInput('')
  }

  return (
    <div className="chat">
      {usage && (
        <div className="studio-usage-bar" title="Total tokens + cost spent building this skill">
          Σ {usageLine(usage)} · {usage.runs} run{usage.runs === 1 ? '' : 's'}
        </div>
      )}
      <div className="chat-scroll" ref={scrollRef}>
        {chat.length === 0 && (
          <div className="chat-empty">
            <p>
              Chat with Claude to build this skill. It reads and edits the skill's files directly —
              changes show here as diffs and land in the editor.
            </p>
            <p className="chat-empty-hint">
              Or highlight text in a file and comment on it — your note arrives here as a message.
            </p>
          </div>
        )}
        {chat.map((item) => (
          <ChatBubble key={item.id} item={item} />
        ))}
        {busy && (
          <div className="chat-working">
            <span className="agent-dot agent-working" />
            Claude is working
            <button className="btn-ghost btn-small" onClick={interruptAuth}>
              Stop
            </button>
          </div>
        )}
      </div>
      <div className="chat-compose">
        <div className="chat-inputrow">
          <textarea
            rows={Math.min(6, Math.max(1, input.split('\n').length))}
            value={input}
            placeholder={busy ? 'Claude is working…' : 'Ask Claude to build or refine this skill…'}
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
      </div>
    </div>
  )
}
