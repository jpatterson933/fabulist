import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store'
import { selectTestChat } from '@/store/selectors'
import { ChatBubble } from '@/components/chat/Messages'
import { ApprovalCard } from '@/components/chat/ApprovalCard'
import { StudioModelPicker } from '@/components/chat/ComposeOptions'
import { useStickToBottom } from '@/lib/useStickToBottom'
import { slashTokenAt, removeSlashToken } from '@/lib/slash'
import { usageLine } from '@/lib/format'
import { formatTestVersion } from '@shared/testVersion'

const NO_PERMISSIONS: never[] = []

interface PluginSkill {
  name: string
  description: string
}

/**
 * The jailed test thread: type a real task, the skill runs in a throwaway sandbox
 * (its sub-agents spin up with it), and the transcript streams here. Type "/" to
 * invoke a specific skill — the model gets a "use the <name> skill" directive, the
 * same way a user would call it, and the skill drives what it reads from there. If the
 * skill asks the user a question, it surfaces here as a card to answer (not auto-skipped).
 */
export default function TestThread({ slug }: { slug: string }): React.JSX.Element {
  const chat = useStore(selectTestChat(slug))
  const permissions = useStore((s) => s.testPermissions[slug]) ?? NO_PERMISSIONS
  const usage = useStore((s) => s.testUsage[slug])
  const status = useStore((s) => s.testAgent[slug])
  const version = useStore((s) => s.testVersion[slug]) ?? 1
  const testSkill = useStore((s) => s.testSkill)
  const resetTest = useStore((s) => s.resetTest)
  const archiveAndResetTest = useStore((s) => s.archiveAndResetTest)
  const interruptTest = useStore((s) => s.interruptTest)
  const respond = useStore((s) => s.respondStudioPermission)
  const [input, setInput] = useState('')
  const [skills, setSkills] = useState<PluginSkill[]>([])
  const [picked, setPicked] = useState<string | null>(null)
  const [slash, setSlash] = useState<{ start: number; query: string } | null>(null)
  const [slashSel, setSlashSel] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { scrollRef, onScroll, stick } = useStickToBottom([chat, status, permissions])
  const busy = status === 'starting' || status === 'working'

  // "New test" → first click arms "Archive current test?", second click archives + bumps
  // the version + opens a fresh thread. An empty thread just clears (nothing to archive).
  const onNewTest = (): void => {
    if (chat.length === 0) {
      void resetTest()
      return
    }
    if (!confirming) {
      setConfirming(true)
      return
    }
    setConfirming(false)
    void archiveAndResetTest()
  }
  // un-arm the confirm if left idle, or when switching skills
  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 4000)
    return () => clearTimeout(t)
  }, [confirming])
  useEffect(() => setConfirming(false), [slug])

  // the skills this plugin ships — the same ones the SDK enables for the run
  useEffect(() => {
    let live = true
    window.fabulist.skillStudio
      .listPluginSkills(slug)
      .then((s) => live && setSkills(s))
      .catch(() => live && setSkills([]))
    return () => {
      live = false
    }
  }, [slug])

  const matches = useMemo(() => {
    if (slash === null) return []
    const q = slash.query.toLowerCase()
    return skills.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 8)
  }, [skills, slash])

  const syncSlash = (text: string, caret: number): void => {
    const token = slashTokenAt(text, caret)
    setSlash(token)
    if (token?.query !== slash?.query) setSlashSel(0)
  }

  const pick = (index: number): void => {
    if (slash === null || !matches[index]) return
    const el = inputRef.current
    setInput(removeSlashToken(input, slash.start))
    setPicked(matches[index].name)
    setSlash(null)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(slash.start, slash.start)
    })
  }

  const send = (): void => {
    if (!input.trim() || busy) return
    stick() // sending always jumps to the latest
    void testSkill(input, { skill: picked ?? undefined })
    setInput('')
    setPicked(null)
    setSlash(null)
  }

  return (
    <section className="studio-test">
      <div className="studio-test-head">
        <span className="studio-test-title">Test v{formatTestVersion(version)}</span>
        <button
          className={`btn-ghost btn-small${confirming ? ' is-confirming' : ''}`}
          onClick={onNewTest}
          disabled={busy}
          title={
            confirming
              ? 'Click again to archive this run and start fresh'
              : 'Archive this run and start a fresh test thread (picks up your latest edits)'
          }
        >
          {confirming ? 'Archive current test?' : '⟳ New test'}
        </button>
      </div>
      {usage && (
        <div className="studio-usage-bar" title="Total tokens + cost across this skill's test runs">
          Σ {usageLine(usage)} · {usage.runs} run{usage.runs === 1 ? '' : 's'}
        </div>
      )}
      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
        {chat.length === 0 && (
          <div className="chat-empty">
            <p>
              Run this skill the way a user would. Give it a real task — a brief, a
              ticket, a description — and watch it respond. Any sub-agents the skill
              bundles spin up too.
            </p>
            <p className="chat-empty-hint">
              Type <code>/</code> to invoke a specific skill by name. Edits to the skill are
              picked up when you start a new test.
            </p>
          </div>
        )}
        {chat.map((item) => (
          <ChatBubble key={item.id} item={item} markdown />
        ))}
        {permissions.map((p) => (
          <ApprovalCard key={p.requestId} request={p} respond={respond} />
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
        {picked && (
          <div className="attach-chips">
            <span className="attach-chip" title={`The "${picked}" skill is invoked for your task`}>
              <span className="attach-chip-name">↪ {picked} skill</span>
              <button onClick={() => setPicked(null)} title="Don't invoke a specific skill">
                ✕
              </button>
            </span>
          </div>
        )}
        <div className="chat-inputrow">
          {slash !== null && matches.length > 0 && (
            <div className="slash-menu" role="listbox">
              {matches.map((s, i) => (
                <button
                  key={s.name}
                  className={`slash-item${i === slashSel ? ' is-selected' : ''}`}
                  onMouseEnter={() => setSlashSel(i)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pick(i)
                  }}
                >
                  <span className="slash-item-name">/{s.name}</span>
                  {s.description && <span className="slash-item-desc">{s.description}</span>}
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={inputRef}
            rows={Math.min(6, Math.max(1, input.split('\n').length))}
            value={input}
            placeholder={busy ? 'Running…' : 'Give the skill a task to test…'}
            disabled={busy}
            onChange={(e) => {
              setInput(e.target.value)
              syncSlash(e.target.value, e.target.selectionStart ?? e.target.value.length)
            }}
            onClick={(e) => syncSlash(input, e.currentTarget.selectionStart ?? input.length)}
            onBlur={() => setSlash(null)}
            onKeyDown={(e) => {
              if (slash !== null && matches.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  return setSlashSel((v) => (v + 1) % matches.length)
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  return setSlashSel((v) => (v + matches.length - 1) % matches.length)
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault()
                  return pick(slashSel)
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
            disabled={busy || !input.trim()}
            title="Run test"
          >
            ↑
          </button>
        </div>
        <div className="chat-options">
          <StudioModelPicker disabled={busy} />
        </div>
      </div>
    </section>
  )
}
