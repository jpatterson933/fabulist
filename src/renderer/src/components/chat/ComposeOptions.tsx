import { useState } from 'react'
import { useStore } from '@/store'

// The compose bar's option controls, extracted from ChatPanel: the model picker,
// the auto-apply toggle, and the "+" menu. Each is self-contained (store hooks +
// simple props), so the composer file no longer carries them.

export function PlusMenu(props: {
  onManageSkills: () => void
  onAttachFiles: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="plus-menu">
      <button
        className="plus-button"
        title="Add skills or attach files"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      >
        +
      </button>
      {open && (
        <div className="plus-menu-pop">
          <button
            onMouseDown={(e) => {
              e.preventDefault()
              setOpen(false)
              props.onAttachFiles()
            }}
          >
            Attach file…
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault()
              setOpen(false)
              props.onManageSkills()
            }}
          >
            Manage skills…
          </button>
        </div>
      )}
    </div>
  )
}

export function AutoApproveToggle(): React.JSX.Element {
  const autoApprove = useStore((s) => s.autoApprove)
  const setAutoApprove = useStore((s) => s.setAutoApprove)
  return (
    <label
      className="auto-approve"
      title="Apply Claude's edits to this document immediately, without approval cards. Commands still ask. Every run is committed, so History can undo anything."
    >
      <input
        type="checkbox"
        checked={autoApprove}
        onChange={(e) => setAutoApprove(e.target.checked)}
      />
      Auto-apply edits
    </label>
  )
}

export function ModelPicker({ disabled }: { disabled: boolean }): React.JSX.Element {
  const model = useStore((s) => s.model)
  const models = useStore((s) => s.models)
  const setModel = useStore((s) => s.setModel)

  // a stored value the engine no longer lists (e.g. saved before a CLI update)
  // still renders, so the selection isn't silently misrepresented
  const options = models.some((m) => m.value === model)
    ? models
    : [...models, { value: model, label: model, hint: 'no longer listed by the CLI' }]
  const current = options.find((m) => m.value === model) ?? options[0]

  return (
    <div className="model-picker">
      <label htmlFor="model-select">Model</label>
      <select
        id="model-select"
        value={current.value}
        disabled={disabled}
        title={disabled ? 'Takes effect on the next message' : current.hint}
        onChange={(e) => setModel(e.target.value)}
      >
        {options.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  )
}
