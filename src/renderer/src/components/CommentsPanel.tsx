import { useEffect, useRef, useState } from 'react'
import type { CommentThread } from '@shared/types'
import { useStore } from '@/store'
import { relativeTime } from '@/components/Library'
import { AttachChips, useAttachments } from '@/lib/useAttachments'

export default function CommentsPanel(): React.JSX.Element {
  const threads = useStore((s) => s.threads)
  const draft = useStore((s) => s.draftComment)
  const scrollTo = useStore((s) => s.scrollTo)
  const listRef = useRef<HTMLDivElement>(null)

  // most recent activity first — a thread jumps up when a reply lands
  const lastAt = (t: CommentThread): number => t.messages[t.messages.length - 1]?.at ?? 0
  const byRecent = (a: CommentThread, b: CommentThread): number => lastAt(b) - lastAt(a)
  const open = threads.filter((t) => t.status === 'open').sort(byRecent)
  const orphaned = threads.filter((t) => t.status === 'orphaned').sort(byRecent)
  const resolved = threads.filter((t) => t.status === 'resolved').sort(byRecent)

  // a fresh draft renders at the top of the list — make sure it's on screen,
  // or "Comment" looks like it did nothing when the list is scrolled down
  useEffect(() => {
    if (draft) listRef.current?.scrollTo({ top: 0 })
  }, [draft])

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
            Highlight a passage and choose <strong>Comment</strong>. Claude reads every comment,
            replies in the thread, and proposes any text changes as suggested edits you approve.
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
  const activeId = useStore((s) => s.activeId)
  const attachments = useAttachments(activeId)
  const [text, setText] = useState('')

  const post = (): void => {
    if (!text.trim() && attachments.paths.length === 0) return
    void submit(attachments.consume(text))
  }

  if (!draft) return <></>
  return (
    <div className="thread-card is-draft">
      <AttachChips attachments={attachments} />
      <textarea
        autoFocus
        rows={3}
        value={text}
        placeholder="Say something about this passage…"
        onChange={(e) => setText(e.target.value)}
        onPaste={attachments.onPaste}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post()
          if (e.key === 'Escape') cancel()
        }}
      />
      <div className="thread-actions">
        <button
          className="btn-primary btn-small"
          disabled={!text.trim() && attachments.paths.length === 0}
          onClick={post}
        >
          Comment
        </button>
        <button className="btn-ghost btn-small" onClick={cancel}>
          Cancel
        </button>
        <span className="thread-draft-hint">Claude replies in the thread</span>
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
  const agent = useStore((s) => (s.activeId ? s.agent[s.activeId] : undefined))
  const busy = agent?.status === 'starting' || agent?.status === 'working'
  const claudeReplying =
    useStore((s) => s.pendingCommentId === thread.id) && busy
  const queued = useStore((s) => s.queuedCommentSends.some((q) => q.commentId === thread.id))

  const activeId = useStore((s) => s.activeId)
  const attachments = useAttachments(activeId)
  const [text, setText] = useState('')
  const isActive = thread.id === activeThreadId

  // selecting a card lights up its highlight and scrolls the editor to it
  const jumpToText = (): void => {
    setActiveThread(thread.id)
    if (thread.status === 'open') {
      useStore.setState({ scrollTo: { threadId: thread.id, seq: ++jumpSeq.current + Date.now() } })
    }
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

      {(claudeReplying || queued) && (
        <div className="thread-replying">
          <span className="agent-dot agent-working" />
          {queued ? 'Claude will reply when free…' : 'Claude is replying…'}
        </div>
      )}

      {thread.status === 'open' && (
        <>
          <AttachChips attachments={attachments} />
          <textarea
            rows={1}
            value={text}
            placeholder="Reply — Claude responds in the thread…"
            onChange={(e) => setText(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onPaste={attachments.onPaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (text.trim() || attachments.paths.length > 0) {
                  void reply(thread.id, attachments.consume(text))
                  setText('')
                }
              }
            }}
          />
          <div className="thread-actions">
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
