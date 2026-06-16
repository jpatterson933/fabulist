import {
  EditorView,
  keymap,
  drawSelection,
  rectangularSelection,
  crosshairCursor
} from '@codemirror/view'
import { EditorState, type Extension } from '@codemirror/state'
import { indentWithTab } from '@codemirror/commands'
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search'

/**
 * General-purpose, code-editor power features — Find, multi-cursor, column
 * selection, Tab-to-indent — bundled as ONE opt-in extension.
 *
 * Deliberately UNBRAIDED from `extensions.ts` (threads / suggestions / reveal):
 * this file owns no document state, no anchors, and no app store. It's a pure,
 * self-contained CodeMirror feature pack that both editors (the writing app's
 * `Editor.tsx` and the Plugin Studio's `StudioCodeEditor.tsx`) pull in with a
 * single spread. Add, remove, or retune a capability here and it changes in both
 * places at once — nothing else needs to know.
 *
 * What you get (all standard CodeMirror, all macOS ⌘ / Windows-Linux Ctrl):
 *   • ⌘F            open the Find / Replace panel (⌘G / ⇧⌘G next / prev, esc closes)
 *   • ⌘D            select the next occurrence of the word/selection (VS Code-style
 *                   multi-cursor — repeat to grow the selection set)
 *   • ⇧⌘L           select every occurrence at once
 *   • ⌘⌥G           go to line
 *   • Tab / ⇧Tab    indent / dedent the current line(s) instead of leaving the editor
 *   • Alt-drag      rectangular (column) selection; crosshair cursor while Alt is held
 *   • live highlight of other instances of the current selection
 *
 * `⌘D` and friends only do anything if multiple selections are both ALLOWED
 * (`allowMultipleSelections`) and DRAWN (`drawSelection` — the native browser
 * selection can only show one range, so without it the extra cursors are
 * invisible). Both are included here so the feature works wherever this is added.
 *
 * The Find panel and match highlights are themed from the app's own CSS variables
 * (`--accent`, `--ink`, `--surface`, …), so the UI matches whichever page hosts it
 * — the writing app and the studio both define these — with no extra global CSS.
 */

// Find panel + match-highlight styling, driven entirely by the host page's CSS
// variables so it reads as part of the app rather than CodeMirror's stock chrome.
const powerTheme = EditorView.theme({
  '.cm-panels': {
    backgroundColor: 'var(--surface, var(--paper))',
    color: 'var(--ink)',
    fontFamily: 'var(--font-ui)'
  },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--line)' },
  '.cm-panel.cm-search': {
    position: 'relative',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 28px 8px 10px',
    fontSize: '12px'
  },
  '.cm-panel.cm-search label': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: '11px',
    color: 'var(--ink-soft)'
  },
  '.cm-panel.cm-search input.cm-textfield, .cm-textfield': {
    fontFamily: 'var(--font-ui)',
    fontSize: '12px',
    color: 'var(--ink)',
    backgroundColor: 'var(--paper)',
    border: '1px solid var(--line)',
    borderRadius: '5px',
    padding: '3px 7px',
    outline: 'none'
  },
  '.cm-panel.cm-search input.cm-textfield:focus, .cm-textfield:focus': {
    borderColor: 'var(--accent)'
  },
  '.cm-button': {
    fontFamily: 'var(--font-ui)',
    fontSize: '11px',
    color: 'var(--ink-soft)',
    backgroundColor: 'transparent',
    backgroundImage: 'none',
    border: '1px solid var(--line)',
    borderRadius: '5px',
    padding: '3px 9px',
    cursor: 'pointer'
  },
  '.cm-button:hover': {
    color: 'var(--ink)',
    borderColor: 'var(--ink-faint)',
    backgroundColor: 'var(--paper)'
  },
  '.cm-panel.cm-search [name=close]': {
    position: 'absolute',
    top: '5px',
    right: '7px',
    padding: '0 5px',
    background: 'transparent',
    border: 'none',
    color: 'var(--ink-faint)',
    fontSize: '15px',
    lineHeight: '1.4',
    cursor: 'pointer'
  },
  '.cm-panel.cm-search [name=close]:hover': { color: 'var(--ink)' },
  // matches of the active Find query, painted in the document
  '.cm-searchMatch': { backgroundColor: 'var(--accent-wash)', borderRadius: '2px' },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'var(--accent)',
    color: 'var(--accent-ink)'
  },
  // other instances of the current selection (highlightSelectionMatches)
  '.cm-selectionMatch': { backgroundColor: 'var(--accent-wash)' }
})

/**
 * The full power-editing bundle. Spread into an editor's extension list:
 *   extensions: [ ...baseExtensions(), ...editorPowerFeatures() ]
 * None of these bindings overlap the editors' existing `defaultKeymap` /
 * `historyKeymap`, so order relative to them doesn't matter.
 */
export function editorPowerFeatures(): Extension[] {
  return [
    EditorState.allowMultipleSelections.of(true),
    drawSelection(),
    rectangularSelection(),
    crosshairCursor(),
    highlightSelectionMatches(),
    search({ top: true }),
    powerTheme,
    keymap.of([...searchKeymap, indentWithTab])
  ]
}
