import { useEffect, useRef } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState, type Extension } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting } from '@codemirror/language'
import { neonMarkdownHighlight, studioEditorTheme } from './markdownTheme'

/**
 * A lean CodeMirror editor for the Skill Studio. For `.md` files it adds Markdown
 * syntax highlighting whose per-element styling is entirely CSS-driven (see
 * markdownTheme.ts → `.studio .cm-md-*` in global.css), so the look is modular and
 * swappable without touching this component. Keyed by `path` upstream, so each file
 * remounts with a fresh editor state.
 */
export default function StudioCodeEditor({
  path,
  value,
  onChange,
  onSelect
}: {
  path: string
  value: string
  onChange: (next: string) => void
  onSelect: (selected: string) => void
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  // keep latest callbacks reachable from the (once-created) update listener
  const onChangeRef = useRef(onChange)
  const onSelectRef = useRef(onSelect)
  onChangeRef.current = onChange
  onSelectRef.current = onSelect

  useEffect(() => {
    if (!host.current) return
    const lang: Extension = path.endsWith('.md') ? markdown() : []
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          lang,
          syntaxHighlighting(neonMarkdownHighlight),
          studioEditorTheme,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString())
            if (u.selectionSet || u.docChanged) {
              const sel = u.state.selection.main
              onSelectRef.current(sel.empty ? '' : u.state.sliceDoc(sel.from, sel.to))
            }
          })
        ]
      })
    })
    view.current = v
    return () => {
      v.destroy()
      view.current = null
    }
    // value is the initial doc only; later changes flow through the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  // external content changes (agent edits / reloads) — sync the doc in place.
  // When the user types, `value` equals the doc already, so this no-ops.
  useEffect(() => {
    const v = view.current
    if (!v) return
    const cur = v.state.doc.toString()
    if (cur !== value) {
      v.dispatch({ changes: { from: 0, to: cur.length, insert: value } })
    }
  }, [value])

  return <div className="studio-cm" ref={host} />
}
