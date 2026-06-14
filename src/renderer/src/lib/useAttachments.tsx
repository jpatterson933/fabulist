import { useState } from 'react'

/** Pastes longer than this become an attachment chip, not inline text. */
export const PASTE_ATTACH_THRESHOLD = 500

export interface Attachments {
  paths: string[]
  add: (paths: string[]) => void
  remove: (path: string) => void
  clear: () => void
  /** Paste handler: long pastes are saved into the doc's attachments folder. */
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
  /** Append the attached-file list to an outgoing message, then reset. */
  consume: (text: string) => string
}

export function useAttachments(docId: string | null): Attachments {
  const [paths, setPaths] = useState<string[]>([])

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    const text = e.clipboardData.getData('text/plain')
    if (text.length <= PASTE_ATTACH_THRESHOLD || !docId) return
    e.preventDefault()
    void window.fabulist.doc
      .attachText(docId, text)
      .then((path) => setPaths((cur) => [...cur, path]))
      .catch(() => {
        // fall back to a plain inline paste
        document.execCommand('insertText', false, text)
      })
  }

  const remove = (path: string): void => {
    setPaths((cur) => cur.filter((p) => p !== path))
    if (docId) void window.fabulist.doc.removeAttachment(docId, path).catch(() => {})
  }

  const consume = (text: string): string => {
    if (paths.length === 0) return text
    setPaths([])
    return `${text.trim()}\n\nAttached files (read them from this project folder):\n${paths
      .map((p) => `- ${p}`)
      .join('\n')}`
  }

  return {
    paths,
    add: (more) => setPaths((cur) => [...cur, ...more]),
    remove,
    clear: () => setPaths([]),
    onPaste,
    consume
  }
}

export function AttachChips({ attachments }: { attachments: Attachments }): React.JSX.Element | null {
  if (attachments.paths.length === 0) return null
  return (
    <div className="attach-chips">
      {attachments.paths.map((p) => (
        <span key={p} className="attach-chip" title={p}>
          <span className="attach-chip-name">{p.replace(/^attachments\//, '')}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              attachments.remove(p)
            }}
            title="Remove attachment"
          >
            ✕
          </button>
        </span>
      ))}
    </div>
  )
}
