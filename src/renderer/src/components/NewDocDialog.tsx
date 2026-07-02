import { useEffect, useMemo, useRef, useState } from 'react'
import { fileNameForType } from '@shared/harness'
import { useStore } from '@/store'

/**
 * The one place documents are created: a title plus, when the studio defines
 * doc types, a type choice with room to show what each type means (icon,
 * label, resulting filename).
 */
export default function NewDocDialog(): React.JSX.Element | null {
  const open = useStore((s) => s.newDocOpen)
  const setOpen = useStore((s) => s.setNewDocOpen)
  const createDoc = useStore((s) => s.createDoc)
  const harness = useStore((s) => s.harness)
  const [title, setTitle] = useState('')
  const [typeId, setTypeId] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const docTypes = harness?.config.docTypes ?? []
  const selected = docTypes.find((t) => t.id === typeId) ?? null

  const slug = useMemo(
    () =>
      (title.trim() || 'untitled')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'untitled',
    [title]
  )
  const fileHint = selected ? fileNameForType(selected, slug) : `${slug}.md`

  useEffect(() => {
    if (open) {
      setTitle('')
      setTypeId('')
      setBusy(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  if (!open) return null

  const submit = async (): Promise<void> => {
    const t = title.trim()
    if (!t || busy) return
    setBusy(true)
    try {
      await createDoc(t, typeId || undefined)
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dialog-overlay" onMouseDown={() => setOpen(false)}>
      <form
        className="dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <h2 className="dialog-title">New document</h2>
        <input
          ref={inputRef}
          className="dialog-input"
          value={title}
          placeholder="Title…"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setOpen(false)
            }
          }}
        />

        {docTypes.length > 0 && (
          <div className="dialog-types" role="radiogroup" aria-label="Document type">
            <button
              type="button"
              className={`dialog-type ${typeId === '' ? 'is-selected' : ''}`}
              onClick={() => setTypeId('')}
            >
              <span className="dialog-type-glyph" aria-hidden>
                ❡
              </span>
              <span className="dialog-type-label">Document</span>
              <span className="dialog-type-hint">plain markdown</span>
            </button>
            {docTypes.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`dialog-type ${typeId === t.id ? 'is-selected' : ''}`}
                onClick={() => setTypeId(t.id)}
                title={t.template ? 'Starts from this type’s template' : undefined}
              >
                <span className="dialog-type-glyph" aria-hidden>
                  {t.icon ?? '❡'}
                </span>
                <span className="dialog-type-label">{t.label ?? t.id}</span>
                <span className="dialog-type-hint">{t.match}</span>
              </button>
            ))}
          </div>
        )}

        <div className="dialog-actions">
          <span className="dialog-file-hint" title="Filename this will create">
            {fileHint}
          </span>
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!title.trim() || busy}>
            Create
          </button>
        </div>
      </form>
    </div>
  )
}
