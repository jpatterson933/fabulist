import { useState } from 'react'
import { useStore } from '@/store'

/**
 * The app wordmark IS the workspace switcher: clicking the ❡ logo opens a menu to
 * move between the writing studio ("Fabulist") and the Skill Studio ("Skillulist
 * Studio"). Lives in the top-left brand slot of whichever rail is showing.
 */
export default function WorkspaceSwitcher(): React.JSX.Element {
  const mode = useStore((s) => s.mode)
  const [open, setOpen] = useState(false)
  const label = mode === 'skillStudio' ? 'Skillulist' : 'Fabulist'

  const choose = (target: 'doc' | 'skillStudio'): void => {
    setOpen(false)
    if (target === mode) return
    if (target === 'skillStudio') void useStore.getState().openStudio()
    else useStore.getState().closeStudio()
  }

  return (
    <div className="ws-switcher">
      <button
        className="ws-switcher-btn"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 140)}
        title="Switch workspace"
      >
        <span className="ws-switcher-glyph" aria-hidden>
          ❡
        </span>
        <span className="ws-switcher-mark">{label}</span>
        <span className="ws-switcher-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="ws-switcher-menu" role="menu">
          <button
            className={mode === 'doc' ? 'is-current' : ''}
            onMouseDown={(e) => {
              e.preventDefault()
              choose('doc')
            }}
          >
            <span className="ws-switcher-name">Fabulist</span>
            <span className="ws-switcher-sub">Writing</span>
          </button>
          <button
            className={mode === 'skillStudio' ? 'is-current' : ''}
            onMouseDown={(e) => {
              e.preventDefault()
              choose('skillStudio')
            }}
          >
            <span className="ws-switcher-name">Skillulist</span>
            <span className="ws-switcher-sub">Skills</span>
          </button>
        </div>
      )}
    </div>
  )
}
