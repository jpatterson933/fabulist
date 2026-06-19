import { Fragment, useEffect, useMemo, useState } from 'react'
import { diffLines } from 'diff'
import type { StudioFileDiff } from '@shared/types'
import { useStore } from '@/store'
import { Chevron } from '@/studio/icons'

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
    <section className="studio-diff-file" data-rel={rel}>
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
  /** 1-based line number on this side (old for left, new for right); absent on empties */
  no?: number
}
interface DiffRow {
  left: Cell
  right: Cell
}

const EMPTY: Cell = { text: '', kind: 'empty' }

/** A rendered row is either a diff pair or a collapsed run of unchanged lines. */
type RenderRow = DiffRow | { gap: number }

function SplitDiff({ before, after }: { before: string; after: string }): React.JSX.Element {
  // wrap is an app-wide toggle (⌥Z); on by default. Wrapped → one column flows with no
  // horizontal scrollbar; unwrapped → the whole grid gets a single horizontal scrollbar
  // (not one per line), aligned across both columns.
  const wrap = useStore((s) => s.studioWrap)
  const rows = useMemo(() => collapseUnchanged(buildRows(before, after)), [before, after])
  return (
    <div className={`studio-diff ${wrap ? 'is-wrap' : 'is-nowrap'}`}>
      {rows.map((r, i) =>
        'gap' in r ? (
          <div className="studio-diff-gap" key={i}>
            ⋯ {r.gap} unchanged line{r.gap === 1 ? '' : 's'}
          </div>
        ) : (
          <Fragment key={i}>
            <span className="studio-diff-ln">{r.left.no ?? ''}</span>
            <pre className={`studio-diff-cell is-${r.left.kind}`}>{r.left.text}</pre>
            {/* data-ln (the new-file line) is what "Open file" reads to land on your spot */}
            <span className="studio-diff-ln" data-ln={r.right.no}>
              {r.right.no ?? ''}
            </span>
            <pre className={`studio-diff-cell is-${r.right.kind}`}>{r.right.text}</pre>
          </Fragment>
        )
      )}
    </div>
  )
}

/**
 * Collapse long runs of unchanged context so the diff shows the CHANGES, not the whole
 * file: keep `context` lines on each side of every change and replace the rest of each run
 * with a "⋯ N unchanged lines" marker. A run at the very top or bottom keeps no outer
 * context — there's no adjacent change there to anchor it to.
 */
function collapseUnchanged(rows: DiffRow[], context = 3): RenderRow[] {
  const isCtx = (r: DiffRow): boolean => r.left.kind === 'ctx' && r.right.kind === 'ctx'
  const out: RenderRow[] = []
  let i = 0
  while (i < rows.length) {
    if (!isCtx(rows[i])) {
      out.push(rows[i])
      i++
      continue
    }
    let j = i
    while (j < rows.length && isCtx(rows[j])) j++
    const run = rows.slice(i, j)
    const head = i === 0 ? 0 : context
    const tail = j === rows.length ? 0 : context
    if (run.length <= head + tail) {
      out.push(...run)
    } else {
      out.push(...run.slice(0, head), { gap: run.length - head - tail }, ...run.slice(run.length - tail))
    }
    i = j
  }
  return out
}

/**
 * Pair a line-level diff into aligned left (removed, soft-red) / right (added, soft-green)
 * rows, carrying each side's running line number (old# on the left, new# on the right).
 */
function buildRows(before: string, after: string): DiffRow[] {
  const rows: DiffRow[] = []
  let del: Cell[] = []
  let add: Cell[] = []
  let oldNo = 1
  let newNo = 1
  const flush = (): void => {
    const n = Math.max(del.length, add.length)
    for (let i = 0; i < n; i++) {
      rows.push({ left: del[i] ?? EMPTY, right: add[i] ?? EMPTY })
    }
    del = []
    add = []
  }
  for (const part of diffLines(before, after)) {
    const lines = toLines(part.value)
    if (part.added) for (const text of lines) add.push({ text, kind: 'add', no: newNo++ })
    else if (part.removed) for (const text of lines) del.push({ text, kind: 'del', no: oldNo++ })
    else {
      flush()
      for (const text of lines) {
        rows.push({ left: { text, kind: 'ctx', no: oldNo++ }, right: { text, kind: 'ctx', no: newNo++ } })
      }
    }
  }
  flush()
  return rows
}

/**
 * The new-file line number at the top of the diff viewport for `rel` — the point the user
 * is currently looking at — so "Open file" lands the editor there. Reads the live diff DOM
 * (the viewport is a singleton); returns undefined when this file's diff isn't on screen,
 * so the caller falls back to opening at the top.
 */
export function diffTopLine(rel: string): number | undefined {
  const view = document.querySelector('.studio-diffview')
  if (!view) return undefined
  const file = Array.from(view.querySelectorAll<HTMLElement>('.studio-diff-file')).find(
    (el) => el.dataset.rel === rel
  )
  if (!file) return undefined
  const top = view.getBoundingClientRect().top
  for (const el of file.querySelectorAll<HTMLElement>('[data-ln]')) {
    // first new-side line whose top is at/below the viewport's top edge
    if (el.getBoundingClientRect().top >= top - 1) {
      const n = Number(el.dataset.ln)
      return Number.isFinite(n) ? n : undefined
    }
  }
  return undefined
}

/** Split a diff chunk into lines, dropping the empty trailing line a final newline leaves. */
function toLines(value: string): string[] {
  const lines = value.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}
