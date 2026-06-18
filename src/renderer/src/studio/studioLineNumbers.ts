import { EditorView, lineNumbers } from '@codemirror/view'
import type { Extension } from '@codemirror/state'

export const subtleLineNumbers: Extension = [
  lineNumbers(),
  EditorView.theme({
    '.cm-gutters': {
      backgroundColor: 'transparent',
      borderRight: 'none',
      color: 'var(--ink-faint)'
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 6px 0 10px',
      minWidth: '2ch',
      fontFamily: 'var(--font-mono)',
      fontSize: 'inherit'
    }
  })
]
