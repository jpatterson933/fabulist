import { useState } from 'react'
import type { ModelChoice } from '@shared/types'
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

export function StudioAutoApproveToggle(): React.JSX.Element {
  const autoApprove = useStore((s) => s.studioAutoApprove)
  const setAutoApprove = useStore((s) => s.setStudioAutoApprove)
  return (
    <label
      className="auto-approve"
      title="Apply the authoring agent's edits to the skill's files immediately, without approval cards. Otherwise each edit waits for your approval."
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

// The presentational picker, shared by the document and studio wrappers below. Each
// wrapper binds its own store slice (the document's per-doc model vs the studio's
// per-skill model), so the two pages stay unbraided while the control is defined once.
function ModelSelect({
  id,
  model,
  models,
  setModel,
  disabled
}: {
  id: string
  model: string
  models: ModelChoice[]
  setModel: (value: string) => void
  disabled: boolean
}): React.JSX.Element {
  // a stored value the engine no longer lists (e.g. saved before a CLI update)
  // still renders, so the selection isn't silently misrepresented
  const options = models.some((m) => m.value === model)
    ? models
    : [...models, { value: model, label: model, hint: 'no longer listed by the CLI' }]
  const current = options.find((m) => m.value === model) ?? options[0]

  return (
    <div className="model-picker">
      <label htmlFor={id}>Model</label>
      <select
        id={id}
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

export function ModelPicker({ disabled }: { disabled: boolean }): React.JSX.Element {
  const model = useStore((s) => s.model)
  const models = useStore((s) => s.models)
  const setModel = useStore((s) => s.setModel)
  return <ModelSelect id="model-select" model={model} models={models} setModel={setModel} disabled={disabled} />
}

/**
 * The Skill Studio's model picker — the same control as the document app's, bound to
 * the active skill's persisted model. One model per skill drives both the authoring
 * chat and the test runs, mirroring how the document app uses one model per document.
 */
export function StudioModelPicker({ disabled }: { disabled: boolean }): React.JSX.Element {
  const model = useStore((s) => s.studioModel)
  const models = useStore((s) => s.models)
  const setModel = useStore((s) => s.setStudioModel)
  return (
    <ModelSelect id="studio-model-select" model={model} models={models} setModel={setModel} disabled={disabled} />
  )
}
