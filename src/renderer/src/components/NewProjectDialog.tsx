import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'

interface TemplateInfo {
  id: string
  name: string
  description: string
}

/**
 * The New Project chooser: a title plus how to start — blank, genesis
 * (a blank project that opens straight into the studio workshop), or one of
 * the built-in starter studios.
 */
export default function NewProjectDialog(): React.JSX.Element | null {
  const open = useStore((s) => s.newProjectOpen)
  const setOpen = useStore((s) => s.setNewProjectOpen)
  const createProject = useStore((s) => s.createProject)
  const createProjectFromTemplate = useStore((s) => s.createProjectFromTemplate)
  const createProjectWithWorkshop = useStore((s) => s.createProjectWithWorkshop)
  const [title, setTitle] = useState('')
  const [source, setSource] = useState('workshop') // 'workshop' | 'blank' | template id
  const [templates, setTemplates] = useState<TemplateInfo[]>([])
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTitle('')
      setSource('workshop')
      setBusy(false)
      window.fabulist.templates
        .list()
        .then(setTemplates)
        .catch(() => setTemplates([]))
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  if (!open) return null

  const submit = async (): Promise<void> => {
    const t = title.trim()
    if (!t || busy) return
    setBusy(true)
    try {
      if (source === 'blank') await createProject(t)
      else if (source === 'workshop') await createProjectWithWorkshop(t)
      else await createProjectFromTemplate(source, t)
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  const card = (
    id: string,
    glyph: string,
    label: string,
    hint: string
  ): React.JSX.Element => (
    <button
      key={id}
      type="button"
      className={`dialog-type dialog-type-wide ${source === id ? 'is-selected' : ''}`}
      onClick={() => setSource(id)}
    >
      <span className="dialog-type-glyph" aria-hidden>
        {glyph}
      </span>
      <span className="dialog-type-label">{label}</span>
      <span className="dialog-type-hint dialog-type-hint-prose">{hint}</span>
    </button>
  )

  return (
    <div className="dialog-overlay" onMouseDown={() => setOpen(false)}>
      <form
        className="dialog dialog-project"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <h2 className="dialog-title">What do you want to make?</h2>
        <input
          ref={inputRef}
          className="dialog-input"
          value={title}
          placeholder="Project title…"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setOpen(false)
            }
          }}
        />

        <div className="dialog-types" role="radiogroup" aria-label="Start from">
          {card(
            'workshop',
            '✦',
            'Design with Claude',
            'describe what you’re making — a website, a course, a research project, a novel — and the agent builds a studio around it'
          )}
          {templates.map((t) => card(t.id, '▦', t.name, t.description))}
          {card('blank', '▢', 'Blank', 'an empty project; just files and the agent')}
        </div>

        <div className="dialog-actions">
          <span className="dialog-file-hint">
            {source === 'workshop' ? 'opens straight into the workshop' : ''}
          </span>
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!title.trim() || busy}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  )
}
