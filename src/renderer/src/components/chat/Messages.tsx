import type { ChatItem } from '@shared/types'
import { isPrimaryDoc } from '@shared/doc'
import { useStore } from '@/store'
import DiffView from '@/components/DiffView'
import { truncate, usageLine } from '@/lib/format'

// The chat transcript renderers, extracted from ChatPanel: message bubbles,
// applied-edit cards, and the grouping of consecutive edits into one card.

/** Runs of back-to-back applied edits become one collapsible group; everything else passes through. */
export function groupConsecutiveEdits(chat: ChatItem[]): (ChatItem | ChatItem[])[] {
  const out: (ChatItem | ChatItem[])[] = []
  for (const item of chat) {
    const last = out[out.length - 1]
    if (item.edit && Array.isArray(last)) last.push(item)
    else if (item.edit && last && !Array.isArray(last) && last.edit) out[out.length - 1] = [last, item]
    else out.push(item)
  }
  return out
}

export function EditGroupCard({ items }: { items: ChatItem[] }): React.JSX.Element {
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

export function ChatBubble({ item }: { item: ChatItem }): React.JSX.Element {
  if (item.usage) {
    return (
      <div className="usage-line" title="Token + cost for this run">
        ▮ {usageLine(item.usage)}
        {item.usage.numTurns != null ? ` · ${item.usage.numTurns} turns` : ''}
      </div>
    )
  }
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
  const isDoc = isPrimaryDoc(edit.filePath)
  return (
    <details className="applied-edit">
      <summary>
        <span className="applied-edit-label">✦ Edited {edit.filePath ?? 'files'}</span>
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
        <DiffView before={edit.before} after={edit.after} mode={edit.tool === 'Write' ? 'lines' : 'words'} />
      </div>
    </details>
  )
}
