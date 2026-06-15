import { useState } from 'react'
import { useStore } from '@/store'
import { selectComments } from '@/store/selectors'
import Markdown from '@/components/Markdown'
import { truncate } from '@/lib/format'

/**
 * Comments tab — a captured selection becomes a draft here; writing a note and sending
 * it posts the note (with the quoted passage + file) into the authoring chat, where
 * Claude responds. Comments are kept per skill (in-memory for now).
 */
export default function StudioComments({ slug }: { slug: string }): React.JSX.Element {
  const draft = useStore((s) => s.studioDraft)
  const comments = useStore(selectComments(slug))
  const submitComment = useStore((s) => s.submitComment)
  const cancelComment = useStore((s) => s.cancelComment)
  const removeComment = useStore((s) => s.removeComment)
  const [note, setNote] = useState('')

  const submit = (): void => {
    if (!note.trim()) return
    void submitComment(note)
    setNote('')
  }

  return (
    <div className="comments">
      {!draft && comments.length === 0 && (
        <div className="comments-empty">
          Highlight text in a file and click <strong>Comment</strong> to ask Claude about that
          passage. Your note goes to the chat, and Claude responds there.
        </div>
      )}
      {draft && (
        <div className="thread-card is-draft">
          <div className="thread-quote">“{truncate(draft.quote, 200)}”</div>
          <textarea
            autoFocus
            value={note}
            placeholder="What should Claude do with this?"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                submit()
              }
            }}
          />
          <div className="thread-actions">
            <button className="btn-primary btn-small" onClick={submit} disabled={!note.trim()}>
              Send to chat
            </button>
            <button
              className="btn-ghost btn-small"
              onClick={() => {
                cancelComment()
                setNote('')
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {comments.map((c) => (
        <div key={c.id} className="thread-card">
          <div className="thread-quote">“{truncate(c.quote, 160)}”</div>
          <div className="thread-messages">
            <div className="thread-msg">
              <span className="thread-msg-author">{c.file}</span>
              <Markdown text={c.note} />
            </div>
          </div>
          <div className="thread-actions">
            <button className="btn-ghost btn-small danger" onClick={() => removeComment(c.id)}>
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
