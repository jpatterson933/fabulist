import { useEffect, useMemo, useRef, useState } from 'react'
import type { ActionDef } from '@shared/harness'
import { useStore } from '@/store'

interface Command {
  id: string
  label: string
  hint?: string
  group: string
  disabled?: boolean
  run: () => void
}

/**
 * ⌘K palette. Its contents are largely the studio harness rendered as
 * commands: manifest actions, discovered skills, panels — plus doc switching
 * and app built-ins.
 */
export default function CommandPalette(): React.JSX.Element | null {
  const open = useStore((s) => s.paletteOpen)
  const setOpen = useStore((s) => s.setPaletteOpen)
  const harness = useStore((s) => s.harness)
  const docs = useStore((s) => s.docs)
  const selectionQuote = useStore((s) => s.selectionQuote)
  const [q, setQ] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const commands = useMemo<Command[]>(() => {
    const s = useStore.getState()
    const out: Command[] = []
    const config = harness?.config

    for (const action of config?.actions ?? []) {
      const needsSelection = action.surface === 'selection'
      out.push({
        id: `action:${action.id}`,
        label: action.label,
        hint:
          action.surface === 'selection'
            ? needsSelection && !selectionQuote
              ? 'select text first'
              : 'on selection'
            : action.surface === 'doc'
              ? 'on this document'
              : undefined,
        group: config?.name ? `${config.name} actions` : 'Actions',
        disabled: needsSelection && !selectionQuote,
        run: () => s.runAction(action)
      })
    }

    // skills not already surfaced through an action
    const surfaced = new Set((config?.actions ?? []).map((a) => a.skill).filter(Boolean))
    for (const skill of harness?.skills ?? []) {
      if (surfaced.has(skill.name)) continue
      const action: ActionDef = {
        id: `skill-${skill.name}`,
        label: skill.name,
        surface: selectionQuote ? 'selection' : 'project',
        skill: skill.name
      }
      out.push({
        id: `skill:${skill.name}`,
        label: skill.name,
        hint: skill.description || 'skill',
        group: 'Skills',
        run: () => s.runAction(action)
      })
    }

    for (const panel of config?.panels ?? []) {
      out.push({
        id: `panel:${panel.id}`,
        label: panel.title,
        hint: panel.source,
        group: 'Panels',
        run: () => {
          s.openPanel(panel.id)
          s.setPaletteOpen(false)
        }
      })
    }

    for (const d of docs) {
      out.push({
        id: `doc:${d.file}`,
        label: d.title,
        hint: d.kindLabel ?? d.file,
        group: 'Documents',
        run: () => {
          void s.openTab(d.file)
          s.setPaletteOpen(false)
        }
      })
    }

    out.push(
      {
        id: 'builtin:workshop',
        label: 'Customize studio…',
        hint: 'design this project’s harness with the agent',
        group: 'Studio',
        run: () => {
          void s.openWorkshop()
          s.setPaletteOpen(false)
        }
      },
      {
        id: 'builtin:new-doc',
        label: 'New document',
        group: 'Studio',
        run: () => {
          s.setPaletteOpen(false)
          s.setNewDocOpen(true)
        }
      },
      {
        id: 'builtin:snapshot',
        label: 'Snapshot',
        hint: 'save a named point in history',
        group: 'Studio',
        run: () => {
          void s.snapshot()
          s.setPaletteOpen(false)
        }
      }
    )
    return out
  }, [harness, docs, selectionQuote])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return commands
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(needle) ||
        c.group.toLowerCase().includes(needle) ||
        (c.hint ?? '').toLowerCase().includes(needle)
    )
  }, [commands, q])

  useEffect(() => {
    if (open) {
      setQ('')
      setIndex(0)
      // focus after the overlay paints
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => setIndex(0), [q])

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [index])

  if (!open) return null

  const move = (delta: number): void => {
    if (filtered.length === 0) return
    let next = index
    for (let i = 0; i < filtered.length; i++) {
      next = (next + delta + filtered.length) % filtered.length
      if (!filtered[next].disabled) break
    }
    setIndex(next)
  }

  const runCurrent = (): void => {
    const cmd = filtered[index]
    if (cmd && !cmd.disabled) cmd.run()
  }

  let lastGroup = ''

  return (
    <div className="palette-overlay" onMouseDown={() => setOpen(false)}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          value={q}
          placeholder="Search actions, skills, documents…"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              move(1)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              move(-1)
            } else if (e.key === 'Enter') {
              e.preventDefault()
              runCurrent()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setOpen(false)
            }
          }}
        />
        <div className="palette-list" ref={listRef}>
          {filtered.length === 0 && <p className="palette-empty">Nothing matches.</p>}
          {filtered.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null
            lastGroup = c.group
            return (
              <div key={c.id}>
                {header && <div className="palette-group">{header}</div>}
                <button
                  className={`palette-item ${i === index ? 'is-active' : ''} ${c.disabled ? 'is-disabled' : ''}`}
                  data-active={i === index}
                  disabled={c.disabled}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => c.run()}
                >
                  <span className="palette-item-label">{c.label}</span>
                  {c.hint && <span className="palette-item-hint">{c.hint}</span>}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
