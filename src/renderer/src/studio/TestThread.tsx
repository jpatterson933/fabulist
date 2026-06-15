import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { selectTestChat } from '@/store/selectors'
import { ChatBubble } from '@/components/chat/Messages'
import { usageLine } from '@/lib/format'

/**
 * The jailed test thread: type a real task, the skill runs in a throwaway sandbox
 * (its sub-agents spin up with it), and the transcript streams here. "New test"
 * starts a fresh thread that re-loads the skill from disk — the iteration loop.
 */
export default function TestThread({ slug }: { slug: string }): React.JSX.Element {
  const chat = useStore(selectTestChat(slug))
  const usage = useStore((s) => s.testUsage[slug])
  const status = useStore((s) => s.testAgent[slug])
  const testSkill = useStore((s) => s.testSkill)
  const resetTest = useStore((s) => s.resetTest)
  const interruptTest = useStore((s) => s.interruptTest)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const busy = status === 'starting' || status === 'working'

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat, status])

  const send = (): void => {
    if (!input.trim() || busy) return
    void testSkill(input)
    setInput('')
  }

  return (
    <section className="studio-test">
      <div className="studio-test-head">
        <span className="studio-test-title">Test</span>
        <button
          className="btn-ghost btn-small"
          onClick={() => void resetTest()}
          disabled={busy}
          title="Start a fresh test thread — picks up your latest edits"
        >
          ⟳ New test
        </button>
      </div>
      {usage && (
        <div className="studio-usage-bar" title="Total tokens + cost across this skill's test runs">
          Σ {usageLine(usage)} · {usage.runs} run{usage.runs === 1 ? '' : 's'}
        </div>
      )}
      <div className="chat-scroll" ref={scrollRef}>
        {chat.length === 0 && (
          <div className="chat-empty">
            <p>
              Run this skill the way a user would. Give it a real task — a brief, a
              ticket, a description — and watch it respond. Any sub-agents the skill
              bundles spin up too.
            </p>
            <p className="chat-empty-hint">
              Edits to the skill are picked up when you start a new test.
            </p>
          </div>
        )}
        {chat.map((item) => (
          <ChatBubble key={item.id} item={item} />
        ))}
        {busy && (
          <div className="chat-working">
            <span className="agent-dot agent-working" />
            Running the skill
            <button className="btn-ghost btn-small" onClick={interruptTest}>
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
            placeholder={busy ? 'Running…' : 'Give the skill a task to test…'}
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
            disabled={busy || !input.trim()}
            title="Run test"
          >
            ↑
          </button>
        </div>
      </div>
    </section>
  )
}
