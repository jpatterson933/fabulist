import { EditorView } from '@codemirror/view'
import { HighlightStyle } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

/**
 * Markdown element styling for the Skill Studio editor — MODULAR by design.
 *
 * This file only MAPS each Markdown token type to a CSS class (`cm-md-*`). All
 * visual styling (colors, weights) lives in CSS as `.studio .cm-md-*` rules driven
 * by `--md-*` custom properties (see global.css). So restyling — or theming the
 * studio differently later — is a CSS-only change; nothing here needs to move.
 */
export const neonMarkdownHighlight = HighlightStyle.define([
  { tag: t.heading1, class: 'cm-md cm-md-h1' },
  { tag: t.heading2, class: 'cm-md cm-md-h2' },
  { tag: t.heading3, class: 'cm-md cm-md-h3' },
  { tag: t.heading4, class: 'cm-md cm-md-h4' },
  { tag: t.heading5, class: 'cm-md cm-md-h5' },
  { tag: t.heading6, class: 'cm-md cm-md-h6' },
  { tag: t.strong, class: 'cm-md cm-md-strong' },
  { tag: t.emphasis, class: 'cm-md cm-md-em' },
  { tag: t.strikethrough, class: 'cm-md cm-md-strike' },
  { tag: t.monospace, class: 'cm-md cm-md-code' },
  { tag: t.link, class: 'cm-md cm-md-link' },
  { tag: t.url, class: 'cm-md cm-md-url' },
  { tag: t.list, class: 'cm-md cm-md-list' },
  { tag: t.quote, class: 'cm-md cm-md-quote' },
  { tag: t.contentSeparator, class: 'cm-md cm-md-hr' },
  { tag: t.processingInstruction, class: 'cm-md cm-md-mark' },
  { tag: t.labelName, class: 'cm-md cm-md-label' },
  { tag: t.meta, class: 'cm-md cm-md-meta' }
])

/** Structural editor theme — colors are inherited from the `.studio` CSS variables. */
export const studioEditorTheme = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--ink)' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)' },
    '.cm-content': {
      fontFamily: 'var(--font-mono)',
      fontSize: '13px',
      lineHeight: '1.7',
      padding: '18px 22px',
      caretColor: 'var(--accent)'
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'var(--selection)'
    },
    '.cm-gutters': { display: 'none' }
  },
  { dark: false }
)
