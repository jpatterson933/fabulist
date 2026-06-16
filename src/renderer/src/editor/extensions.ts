import {
  EditorView,
  Decoration,
  WidgetType,
  type DecorationSet,
  keymap,
  placeholder
} from '@codemirror/view'
import { EditorState, StateField, StateEffect, RangeSetBuilder, Annotation } from '@codemirror/state'
import type { SuggestSegment } from '@/lib/suggest'

/**
 * Marks transactions that replace the document from outside the editor
 * (Claude's edits, restores, doc switches). Position-mapped thread ranges are
 * meaningless across such replaces and must never be persisted as anchors.
 */
export const externalChange = Annotation.define<boolean>()
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { editorPowerFeatures } from './powerEditing'

// ---------- comment highlights ----------

export interface ThreadRange {
  id: string
  from: number
  to: number
  active: boolean
}

export const setThreadRanges = StateEffect.define<ThreadRange[]>()

function buildDecorations(ranges: ThreadRange[], docLength: number): DecorationSet {
  const sorted = [...ranges]
    .filter((r) => r.from < r.to && r.to <= docLength)
    .sort((a, b) => a.from - b.from || a.to - b.to)
  const builder = new RangeSetBuilder<Decoration>()
  for (const r of sorted) {
    builder.add(
      r.from,
      r.to,
      Decoration.mark({
        class: r.active ? 'cm-thread cm-thread-active' : 'cm-thread',
        attributes: { 'data-thread': r.id }
      })
    )
  }
  return builder.finish()
}

export const threadField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(setThreadRanges)) deco = buildDecorations(e.value, tr.newDoc.length)
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f)
})

/** Read current (mapped) thread positions back out of the decoration set. */
export function currentThreadRanges(state: EditorState): { id: string; from: number; to: number }[] {
  const out: { id: string; from: number; to: number }[] = []
  const deco = state.field(threadField, false)
  if (!deco) return out
  const iter = deco.iter()
  while (iter.value) {
    const id = iter.value.spec.attributes?.['data-thread']
    if (id) out.push({ id, from: iter.from, to: iter.to })
    iter.next()
  }
  return out
}

// ---------- inline suggestions (Claude's pending edit, Google-Docs style) ----------

export const setSuggestion = StateEffect.define<SuggestSegment[] | null>()

class InsertionWidget extends WidgetType {
  constructor(readonly text: string) {
    super()
  }
  eq(other: InsertionWidget): boolean {
    return other.text === this.text
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-suggest-ins'
    span.textContent = this.text
    return span
  }
  ignoreEvent(): boolean {
    return true
  }
}

export const suggestionField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (!e.is(setSuggestion)) continue
      if (!e.value) {
        deco = Decoration.none
        continue
      }
      const segs = [...e.value]
        .filter((s) => s.from <= tr.newDoc.length && s.to <= tr.newDoc.length)
        .sort((a, b) => a.from - b.from || (a.kind === 'del' ? -1 : 1))
      const builder = new RangeSetBuilder<Decoration>()
      for (const s of segs) {
        if (s.kind === 'del') {
          builder.add(s.from, s.to, Decoration.mark({ class: 'cm-suggest-del' }))
        } else {
          builder.add(
            s.from,
            s.from,
            Decoration.widget({ widget: new InsertionWidget(s.text ?? ''), side: 1 })
          )
        }
      }
      deco = builder.finish()
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f)
})

// ---------- transient reveal highlight ("Show in document") ----------

// A self-contained, opt-in highlight: "Show in document" paints the edited span
// so the eye lands on the new text, and the next click clears it. Deliberately
// kept separate from threadField/suggestionField — it owns no anchors, persists
// nothing, and the only way in is the setReveal effect.
export const setReveal = StateEffect.define<{ from: number; to: number } | null>()

export const revealField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (!e.is(setReveal)) continue
      deco =
        e.value && e.value.from < e.value.to && e.value.to <= tr.newDoc.length
          ? Decoration.set(Decoration.mark({ class: 'cm-reveal' }).range(e.value.from, e.value.to))
          : Decoration.none
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f)
})

// ---------- markdown typography ----------

const mdHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontFamily: 'var(--font-display)', fontSize: '1.7em', fontWeight: '560', lineHeight: '1.25' },
  { tag: tags.heading2, fontFamily: 'var(--font-display)', fontSize: '1.4em', fontWeight: '540', lineHeight: '1.3' },
  { tag: tags.heading3, fontFamily: 'var(--font-display)', fontSize: '1.15em', fontWeight: '560' },
  { tag: tags.heading4, fontFamily: 'var(--font-display)', fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: '640' },
  { tag: tags.strikethrough, textDecoration: 'line-through', opacity: '0.6' },
  { tag: tags.link, color: 'var(--accent)' },
  { tag: tags.url, color: 'var(--ink-faint)' },
  { tag: tags.quote, color: 'var(--ink-soft)', fontStyle: 'italic' },
  { tag: tags.monospace, fontFamily: 'var(--font-mono)', fontSize: '0.85em', color: 'var(--accent-deep)' },
  { tag: tags.meta, color: 'var(--ink-faint)' },
  { tag: tags.processingInstruction, color: 'var(--ink-faint)' },
  { tag: tags.contentSeparator, color: 'var(--ink-faint)' },
  { tag: tags.list, color: 'inherit' }
])

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '17.5px',
    backgroundColor: 'transparent',
    color: 'var(--ink)'
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-serif)',
    lineHeight: '1.72',
    padding: '0 max(48px, calc(50% - 37ch)) 30vh'
  },
  '.cm-content': {
    maxWidth: '74ch',
    caretColor: 'var(--accent)',
    padding: '40px 0 0'
  },
  '.cm-line': { padding: '0' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground': { backgroundColor: 'var(--selection) !important' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--selection) !important' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '.cm-thread': {
    backgroundColor: 'var(--thread-bg)',
    borderBottom: '2px solid var(--thread-edge)',
    cursor: 'pointer',
    transition: 'background-color 160ms ease'
  },
  '.cm-thread-active': {
    backgroundColor: 'var(--thread-bg-active)',
    borderBottomColor: 'var(--accent)'
  },
  '.cm-placeholder': { color: 'var(--ink-faint)', fontStyle: 'italic' }
})

export function baseExtensions(): ReturnType<typeof markdown>[] {
  return [
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    markdown({ base: markdownLanguage }),
    syntaxHighlighting(mdHighlight),
    EditorView.lineWrapping,
    editorTheme,
    placeholder('Begin…'),
    threadField,
    suggestionField,
    revealField,
    // Find (⌘F), multi-cursor (⌘D), column select, Tab-to-indent — kept in its
    // own self-contained module so it's easy to retune independently.
    ...editorPowerFeatures()
  ] as ReturnType<typeof markdown>[]
}
