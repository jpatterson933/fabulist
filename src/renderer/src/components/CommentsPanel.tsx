import { useEffect, useRef, useState } from 'react'
import type { CommentThread } from '@shared/types'
import { useStore } from '@/store'
import { relativeTime } from '@/components/Library'

export default function CommentsPanel(): React.JSX.Element {
  const threads = useStore((s) => s.threads)
  const draft = useStore((s) => s.draftComment)
  const scrollTo = useStore((s) => s.scrollTo)
  const listRef = useRef<HTMLDivElement>(null)

  const open = threads.filter((t) => t.status === 'open')
  const orphaned = threads.filter((t) => t.status === 'orphaned')
  const resolved = threads.filter((t) => t.status === 'resolved')

  useEffect(() => {
    if (!scrollTo) return
    const list = listRef.current
    const el = list?.querySelector<HTMLElement>(`[data-thread-card="${scrollTo.threadId}"]`)
    if (!list || !el) return
    // scroll only the comments list — scrollIntoView would also scroll
    // overflow-hidden ancestors and shift the whole app chrome off-screen
    const target =
      el.getBoundingClientRect().top -
      list.getBoundingClientRect().top +
      list.scrollTop -
      (list.clientHeight - el.clientHeight) / 2
    list.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [scrollTo])

  return (
    <div className="comments" ref={listRef}>
      {draft && <DraftCard />}
      {!draft && threads.length === 0 && (
        <div className="comments-empty">
          <p>
            Highlight a passage in the editor and choose <strong>Comment</strong> to start a
            thread. Claude can weigh in on any thread and propose changes to the text.
          </p>
        </div>
      )}
      {open.map((t) => (
        <ThreadCard key={t.id} thread={t} />
      ))}
      {orphaned.length > 0 && (
        <>
          <div className="comments-divider">No longer in the text</div>
          {orphaned.map((t) => (
            <ThreadCard key={t.id} thread={t} />
          ))}
        </>
      )}
      {resolved.length > 0 && (
        <>
          <div className="comments-divider">Resolved</div>
          {resolved.map((t) => (
            <ThreadCard key={t.id} thread={t} />
          ))}
        </>
      )}
    </div>
  )
}

function DraftCard(): React.JSX.Element {
  const draft = useStore((s) => s.draftComment)
  const submit = useStore((s) => s.submitDraftComment)
  const cancel = useStore((s) => s.cancelDraftComment)
  const [text, setText] = useState('')

  if (!draft) return <></>
  return (
    <div className="thread-card is-draft">
      <textarea
        autoFocus
        rows={3}
        value={text}
        placeholder="Say something about this passage…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit(text)
          if (e.key === 'Escape') cancel()
        }}
      />
      <div className="thread-actions">
        <button className="btn-primary btn-small" disabled={!text.trim()} onClick={() => void submit(text)}>
          Comment
        </button>
        <button className="btn-ghost btn-small" onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function ThreadCard({ thread }: { thread: CommentThread }): React.JSX.Element {
  const activeThreadId = useStore((s) => s.activeThreadId)
  const setActiveThread = useStore((s) => s.setActiveThread)
  const jumpSeq = useRef(0)
  const reply = useStore((s) => s.replyToThread)
  const resolve = useStore((s) => s.resolveThread)
  const remove = useStore((s) => s.removeThread)
  const askClaude = useStore((s) => s.askClaude)
  const agent = useStore((s) => (s.activeId ? s.agent[s.activeId] : undefined))
  const busy = agent?.status === 'starting' || agent?.status === 'working'

  const [text, setText] = useState('')
  const isActive = thread.id === activeThreadId

  // selecting a card lights up its highlight and scrolls the editor to it
  const jumpToText = (): void => {
    setActiveThread(thread.id)
    if (thread.status === 'open') {
      useStore.setState({ scrollTo: { threadId: thread.id, seq: ++jumpSeq.current + Date.now() } })
    }
  }

  const sendToClaude = (): void => {
    const transcript = thread.messages
      .map((m) => `${m.author === 'you' ? 'Author' : 'Claude'}: ${m.text}`)
      .join('\n')
    askClaude(`Comment thread on the quoted passage:\n\n${transcript}`, {
      quote: thread.anchor.text,
      commentId: thread.id
    })
  }

  return (
    <div
      data-thread-card={thread.id}
      className={`thread-card ${isActive ? 'is-active' : ''} ${thread.status !== 'open' ? 'is-muted' : ''}`}
      onClick={jumpToText}
      title={thread.status === 'open' ? 'Jump to the highlighted text' : undefined}
    >
      {thread.status === 'orphaned' && (
        <blockquote className="thread-quote">“{truncate(thread.anchor.text, 140)}”</blockquote>
      )}

      <div className="thread-messages">
        {thread.messages.map((m) => (
          <div key={m.id} className={`thread-msg ${m.author === 'claude' ? 'from-claude' : ''}`}>
            <span className="thread-msg-author">{m.author === 'claude' ? 'Claude' : 'You'}</span>
            <span className="thread-msg-time">{relativeTime(m.at)}</span>
            <p>{m.text}</p>
          </div>
        ))}
      </div>

      {thread.status === 'open' && (
        <>
          <textarea
            rows={1}
            value={text}
            placeholder="Reply…"
            onChange={(e) => setText(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (text.trim()) {
                  void reply(thread.id, text)
                  setText('')
                }
              }
            }}
          />
          <div className="thread-actions">
            <button
              className="btn-accent btn-small"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation()
                sendToClaude()
              }}
              title="Claude replies in this thread and may propose an edit"
            >
              ✦ Ask Claude
            </button>
            <button
              className="btn-ghost btn-small"
              onClick={(e) => {
                e.stopPropagation()
                void resolve(thread.id, 'resolved')
              }}
            >
              Resolve
            </button>
          </div>
        </>
      )}

      {thread.status !== 'open' && (
        <div className="thread-actions">
          {thread.status === 'resolved' && (
            <button className="btn-ghost btn-small" onClick={() => void resolve(thread.id, 'open')}>
              Reopen
            </button>
          )}
          <button className="btn-ghost btn-small danger" onClick={() => void remove(thread.id)}>
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}
