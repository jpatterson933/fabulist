import { useEffect, useMemo, useState } from 'react'
import { diffLines } from 'diff'
import type { StudioFileDiff } from '@shared/types'
import { useStore } from '@/store'

/**
 * The version-control diff viewport — a self-contained side-by-side renderer that takes
 * over the main editor area when a Changes/Staged row (or "Open changes") is opened. It is
 * deliberately separate from the editor's Claude inline-suggestion logic: this only compares
 * file versions resolved by git (working tree / index / HEAD) and reuses the shared diff
 * colour tokens, without touching the suggestion machinery.
 */
export default function StudioDiff({
  slug,
  scope,
  rels
}: {
  slug: string
  scope: 'changes' | 'staged'
  rels: string[]
}): React.JSX.Element {
  return (
    <div className="studio-diffview">
      {rels.map((rel) => (
        <FileDiff key={`${scope}:${rel}`} slug={slug} scope={scope} rel={rel} />
      ))}
    </div>
  )
}

function FileDiff({
  slug,
  scope,
  rel
}: {
  slug: string
  scope: 'changes' | 'staged'
  rel: string
}): React.JSX.Element {
  const [open, setOpen] = useState(true)
  const [data, setData] = useState<StudioFileDiff | null>(null)
  const reportError = useStore((s) => s.reportError)

  useEffect(() => {
    let alive = true
    window.fabulist.skillStudio
      .diff(slug, rel, scope)
      .then((d) => {
        if (alive) setData(d)
      })
      .catch((e) => reportError(e, 'Couldn’t load the diff'))
    return () => {
      alive = false
    }
  }, [slug, rel, scope, reportError])

  return (
    <section className="studio-diff-file">
      <button className="studio-diff-head" onClick={() => setOpen((v) => !v)}>
        <Chevron open={open} />
        <span className="studio-diff-path">{rel}</span>
      </button>
      {open &&
        (data === null ? (
          <p className="studio-diff-note">Loading…</p>
        ) : data.binary ? (
          <p className="studio-diff-note">Binary file — no preview.</p>
        ) : (
          <SplitDiff before={data.before} after={data.after} />
        ))}
    </section>
  )
}

type CellKind = 'ctx' | 'del' | 'add' | 'empty'
interface Cell {
  text: string
  kind: CellKind
}
interface DiffRow {
  left: Cell
  right: Cell
}

const EMPTY: Cell = { text: '', kind: 'empty' }

function SplitDiff({ before, after }: { before: string; after: string }): React.JSX.Element {
  const rows = useMemo(() => buildRows(before, after), [before, after])
  return (
    <div className="studio-diff">
      {rows.map((r, i) => (
        <div className="studio-diff-row" key={i}>
          <pre className={`studio-diff-cell is-${r.left.kind}`}>{r.left.text}</pre>
          <pre className={`studio-diff-cell is-${r.right.kind}`}>{r.right.text}</pre>
        </div>
      ))}
    </div>
  )
}

/** Pair a line-level diff into aligned left (removed, soft-red) / right (added, soft-green) rows. */
function buildRows(before: string, after: string): DiffRow[] {
  const rows: DiffRow[] = []
  let del: string[] = []
  let add: string[] = []
  const flush = (): void => {
    const n = Math.max(del.length, add.length)
    for (let i = 0; i < n; i++) {
      rows.push({
        left: i < del.length ? { text: del[i], kind: 'del' } : EMPTY,
        right: i < add.length ? { text: add[i], kind: 'add' } : EMPTY
      })
    }
    del = []
    add = []
  }
  for (const part of diffLines(before, after)) {
    const lines = toLines(part.value)
    if (part.added) add.push(...lines)
    else if (part.removed) del.push(...lines)
    else {
      flush()
      for (const line of lines) rows.push({ left: { text: line, kind: 'ctx' }, right: { text: line, kind: 'ctx' } })
    }
  }
  flush()
  return rows
}

/** Split a diff chunk into lines, dropping the empty trailing line a final newline leaves. */
function toLines(value: string): string[] {
  const lines = value.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

function Chevron({ open }: { open: boolean }): React.JSX.Element {
  return (
    <svg
      className={`studio-file-chevron ${open ? '' : 'is-collapsed'}`}
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
    >
      <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
