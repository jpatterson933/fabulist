import { useEffect, useMemo, useState } from 'react'
import type { FrontmatterFieldDef } from '@shared/harness'
import { useStore } from '@/store'

/**
 * The structured header a harness file type declares via `fields`: frontmatter
 * keys rendered as a form above the prose. A select for enumerated fields, a
 * text input (committed on blur/Enter) for free ones. Edits rewrite the
 * document's frontmatter block in place — the file stays plain Markdown.
 */

const FM_RE = /^---\n([\s\S]*?)\n---\n?/

function readValues(content: string): Record<string, string> {
  const m = content.match(FM_RE)
  const out: Record<string, string> = {}
  if (!m) return out
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/)
    if (kv) out[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

/** Rewrite (or create) the frontmatter block with `key` set; empty removes it. */
function writeValue(content: string, key: string, value: string): string {
  const clean = value.trim()
  const m = content.match(FM_RE)
  if (!m) {
    return clean ? `---\n${key}: ${clean}\n---\n\n${content}` : content
  }
  const lines = m[1] === '' ? [] : m[1].split('\n')
  const idx = lines.findIndex((l) => l.match(/^([\w-]+):/)?.[1] === key)
  if (idx === -1 && clean) lines.push(`${key}: ${clean}`)
  else if (idx !== -1 && clean) lines[idx] = `${key}: ${clean}`
  else if (idx !== -1) lines.splice(idx, 1)
  const rest = content.slice(m[0].length)
  return lines.length === 0 ? rest : `---\n${lines.join('\n')}\n---\n${rest}`
}

function TextField({
  value,
  onCommit
}: {
  value: string
  onCommit: (v: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(value)
  // follow external changes (agent edits, file switches) unless mid-edit
  useEffect(() => setDraft(value), [value])
  return (
    <input
      className="fm-field-input"
      value={draft}
      placeholder="—"
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={() => draft.trim() !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(value)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

export default function FrontmatterFields({
  fields
}: {
  fields: FrontmatterFieldDef[]
}): React.JSX.Element {
  const content = useStore((s) => s.content)
  const replaceContent = useStore((s) => s.replaceContent)
  const values = useMemo(() => readValues(content), [content])

  const commit = (key: string, value: string): void => {
    replaceContent(writeValue(useStore.getState().content, key, value))
  }

  return (
    <div className="fm-fields">
      {fields.map((f) => (
        <label key={f.key} className="fm-field">
          <span className="fm-field-key">{f.key}</span>
          {f.values ? (
            <select
              className="fm-field-select"
              value={f.values.includes(values[f.key]) ? values[f.key] : ''}
              onChange={(e) => commit(f.key, e.currentTarget.value)}
            >
              <option value="">—</option>
              {f.values.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          ) : (
            <TextField value={values[f.key] ?? ''} onCommit={(v) => commit(f.key, v)} />
          )}
        </label>
      ))}
    </div>
  )
}
