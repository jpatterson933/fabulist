import { useMemo, useRef, useState } from 'react'
import { useStore } from '@/store'
import { selectAuthChat, selectTestChat } from '@/store/selectors'
import { ChatBubble } from '@/components/chat/Messages'
import { ApprovalCard } from '@/components/chat/ApprovalCard'
import { StudioAutoApproveToggle, StudioModelPicker } from '@/components/chat/ComposeOptions'
import { studioInlineEdit } from '@/studio/inlineEdit'
import { useStickToBottom } from '@/lib/useStickToBottom'
import { slashTokenAt, removeSlashToken } from '@/lib/slash'
import { usageLine } from '@/lib/format'
import { MAX_ARCHIVED_TESTS, type ArchivedTest } from '@shared/types'

const NO_PERMISSIONS: never[] = []
const NO_ARCHIVED: ArchivedTest[] = []

type TestRef = 'current' | { version: string }

/**
 * The main chat with the skill — an authoring agent that reads and edits the skill's
 * files directly. By default each edit arrives as an approval card (Apply / Decline)
 * with a diff; toggle "Auto-apply edits" to apply them immediately. Applied edits land
 * in the editor with a "Show in file" jump. Type "/" to reference a test run — the
 * current live run, or (under "Archived") any past run, searchable by version — and its
 * transcript is sent along as context.
 */
export default function StudioChat({ slug }: { slug: string }): React.JSX.Element {
  const chat = useStore(selectAuthChat(slug))
  const testChat = useStore(selectTestChat(slug))
  const archived = useStore((s) => s.archivedTests[slug]) ?? NO_ARCHIVED
  const permissions = useStore((s) => s.authPermissions[slug]) ?? NO_PERMISSIONS
  const usage = useStore((s) => s.authUsage[slug])
  const status = useStore((s) => s.authAgent[slug])
  const fileContent = useStore((s) => s.fileContent)
  const openFilePath = useStore((s) => s.openFilePath)
  const authSend = useStore((s) => s.authSend)
  const interruptAuth = useStore((s) => s.interruptAuth)
  const respond = useStore((s) => s.respondStudioPermission)
  const reveal = useStore((s) => s.revealStudioEdit)

  // the pending edit shown inline in the editor (if any) — its chat card collapses to a
  // compact "shown in the editor" form, matching the document app
  const inlineId = useMemo(
    () => studioInlineEdit(fileContent, openFilePath, permissions)?.requestId ?? null,
    [fileContent, openFilePath, permissions]
  )
  const [input, setInput] = useState('')
  const [testRef, setTestRef] = useState<TestRef | null>(null)
  const [slash, setSlash] = useState<{ start: number; query: string } | null>(null)
  const [archivedView, setArchivedView] = useState(false)
  const [archivedQuery, setArchivedQuery] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { scrollRef, onScroll, stick } = useStickToBottom([chat, status, permissions])
  const busy = status === 'starting' || status === 'working'

  const hasTest = testChat.length > 0

  // top-level "/" options: the live run, and (if any) an entry into the archive
  const topOptions = useMemo(() => {
    if (slash === null || archivedView) return []
    const q = slash.query.toLowerCase()
    const opts: { key: 'current' | 'archived'; name: string; desc: string }[] = []
    if (hasTest && 'test'.includes(q))
      opts.push({ key: 'current', name: '/test', desc: 'Reference the current test run' })
    if (archived.length > 0 && 'archived'.includes(q))
      opts.push({ key: 'archived', name: 'Archived', desc: `Reference a past run (${archived.length})` })
    return opts
  }, [slash, archivedView, hasTest, archived.length])

  const archivedMatches = useMemo(() => {
    const q = archivedQuery.trim().toLowerCase()
    return archived.filter((a) => a.version.toLowerCase().includes(q)).slice(0, 5)
  }, [archived, archivedQuery])

  const syncSlash = (text: string, caret: number): void => setSlash(slashTokenAt(text, caret))

  const closeMenu = (): void => {
    setSlash(null)
    setArchivedView(false)
    setArchivedQuery('')
  }

  // drop the "/query" the user typed; the reference becomes a chip instead
  const removeToken = (): void => {
    if (slash === null) return
    const el = inputRef.current
    setInput(removeSlashToken(input, slash.start))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(slash.start, slash.start)
    })
  }

  const chooseTop = (key: 'current' | 'archived'): void => {
    if (key === 'current') {
      removeToken()
      setTestRef('current')
      closeMenu()
    } else {
      setArchivedView(true) // keep the slash token until a version is picked
      setArchivedQuery('')
    }
  }

  const pickArchived = (version: string): void => {
    removeToken()
    setTestRef({ version })
    closeMenu()
  }

  const send = (): void => {
    if (!input.trim() || busy) return
    stick()
    void authSend(input, testRef ? { testRef } : {})
    setInput('')
    setTestRef(null)
    closeMenu()
  }

  return (
    <div className="chat">
      {usage && (
        <div className="studio-usage-bar" title="Total tokens + cost spent building this skill">
          Σ {usageLine(usage)} · {usage.runs} run{usage.runs === 1 ? '' : 's'}
        </div>
      )}
      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
        {chat.length === 0 && (
          <div className="chat-empty">
            <p>
              Chat with Claude to build this skill. It reads and edits the skill's files directly —
              changes show here as diffs and land in the editor.
            </p>
            <p className="chat-empty-hint">
              Type <code>/</code> to reference a test run (current or archived), or highlight text in
              a file and comment on it — your note arrives here as a message.
            </p>
          </div>
        )}
        {chat.map((item) => (
          <ChatBubble key={item.id} item={item} reveal={reveal} markdown />
        ))}
        {permissions.map((p) => (
          <ApprovalCard
            key={p.requestId}
            request={p}
            respond={respond}
            inline={p.requestId === inlineId}
          />
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
        {testRef && (
          <div className="attach-chips">
            <span className="attach-chip" title="This test run's transcript is sent with your message">
              <span className="attach-chip-name">
                ↪ {testRef === 'current' ? 'Latest test run' : `Test v${testRef.version}`}
              </span>
              <button onClick={() => setTestRef(null)} title="Remove reference">
                ✕
              </button>
            </span>
          </div>
        )}
        <div className="chat-inputrow">
          {slash !== null && !archivedView && topOptions.length > 0 && (
            <div className="slash-menu" role="listbox">
              {topOptions.map((o) => (
                <button
                  key={o.key}
                  className="slash-item"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    chooseTop(o.key)
                  }}
                >
                  <span className="slash-item-name">{o.name}</span>
                  <span className="slash-item-desc">{o.desc}</span>
                </button>
              ))}
            </div>
          )}
          {slash !== null && archivedView && (
            <div className="slash-menu" role="listbox">
              <input
                className="slash-search"
                autoFocus
                value={archivedQuery}
                placeholder="Search version… e.g. 0.0.1"
                onChange={(e) => setArchivedQuery(e.target.value)}
                onBlur={() => setTimeout(closeMenu, 150)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    closeMenu()
                  } else if (e.key === 'Enter' && archivedMatches[0]) {
                    e.preventDefault()
                    pickArchived(archivedMatches[0].version)
                  }
                }}
              />
              {archivedMatches.length === 0 ? (
                <div className="slash-item slash-item-manage" aria-disabled>
                  No matching runs
                </div>
              ) : (
                archivedMatches.map((a) => (
                  <button
                    key={a.version}
                    className="slash-item"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pickArchived(a.version)
                    }}
                  >
                    <span className="slash-item-name">test v{a.version}</span>
                    <span className="slash-item-desc">{new Date(a.at).toLocaleString()}</span>
                  </button>
                ))
              )}
              {archived.length >= MAX_ARCHIVED_TESTS && (
                <div className="slash-item slash-item-manage" aria-disabled>
                  Keeping the {MAX_ARCHIVED_TESTS} most recent runs — older runs are dropped when you
                  start a new test.
                </div>
              )}
            </div>
          )}
          <textarea
            ref={inputRef}
            rows={Math.min(6, Math.max(1, input.split('\n').length))}
            value={input}
            placeholder={busy ? 'Claude is working…' : 'Ask Claude to build or refine this skill…'}
            disabled={busy}
            onChange={(e) => {
              setInput(e.target.value)
              syncSlash(e.target.value, e.target.selectionStart ?? e.target.value.length)
            }}
            onClick={(e) => syncSlash(input, e.currentTarget.selectionStart ?? input.length)}
            // keep the menu open while focus moves into the archived search input
            onBlur={() => {
              if (!archivedView) setSlash(null)
            }}
            onKeyDown={(e) => {
              if (slash !== null && !archivedView && topOptions.length > 0) {
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault()
                  return chooseTop(topOptions[0].key)
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  return closeMenu()
                }
              }
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
        <div className="chat-options">
          <StudioModelPicker disabled={busy} />
          <StudioAutoApproveToggle />
        </div>
      </div>
    </div>
  )
}
