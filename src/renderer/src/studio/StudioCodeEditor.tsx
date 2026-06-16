import { useEffect, useRef } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState, type Extension } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting } from '@codemirror/language'
import { setReveal, revealField } from '@/editor/extensions'
import { minimalReplace } from '@/lib/externalMerge'
import { neonMarkdownHighlight, studioEditorTheme } from './markdownTheme'

// Remember each file's scroll position across remounts (the editor is keyed by file
// upstream, so switching files away and back would otherwise start at the top). Keyed by
// `scrollKey` (skill + file); in-memory for the session, which is what comparison needs.
const scrollMemory = new Map<string, number>()

/**
 * A lean CodeMirror editor for the Skill Studio. For `.md` files it adds Markdown
 * syntax highlighting whose per-element styling is entirely CSS-driven (see
 * markdownTheme.ts → `.studio .cm-md-*` in global.css), so the look is modular and
 * swappable without touching this component. Keyed by `path` upstream, so each file
 * remounts with a fresh editor state; `scrollKey` lets it restore where you'd scrolled.
 *
 * `revealPos` carries a "Show in file" request from the chat: scroll to + briefly
 * highlight an applied edit. It reuses the editor's transient revealField/setReveal,
 * the same mechanism the document editor uses (and takes precedence over scroll restore).
 */
export default function StudioCodeEditor({
  path,
  value,
  scrollKey,
  revealPos,
  onChange,
  onSelect
}: {
  path: string
  value: string
  /** stable per-file id (skill + file) used to remember/restore scroll position */
  scrollKey: string
  revealPos?: { from: number; to: number; seq: number } | null
  onChange: (next: string) => void
  onSelect: (selected: string) => void
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  // keep latest callbacks/props reachable from the (once-created) effects
  const onChangeRef = useRef(onChange)
  const onSelectRef = useRef(onSelect)
  const revealPosRef = useRef(revealPos)
  const scrollKeyRef = useRef(scrollKey)
  onChangeRef.current = onChange
  onSelectRef.current = onSelect
  revealPosRef.current = revealPos
  scrollKeyRef.current = scrollKey

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
          revealField,
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
    // restore where we left this file — after layout (rAF), and not if a "Show in file"
    // reveal is taking us somewhere specific instead
    const savedTop = scrollMemory.get(scrollKey)
    if (savedTop != null) {
      requestAnimationFrame(() => {
        if (view.current === v && !revealPosRef.current) v.scrollDOM.scrollTop = savedTop
      })
    }
    return () => {
      scrollMemory.set(scrollKeyRef.current, v.scrollDOM.scrollTop)
      v.destroy()
      view.current = null
    }
    // value is the initial doc only; later changes flow through the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  // external content changes (agent edits, auto-format, reloads) — sync the doc in place.
  // Use a minimal single-span replace, not a whole-doc swap, so CodeMirror maps the scroll
  // position through the change and the viewport stays put (no snap to the top on format).
  // When the user types, `value` equals the doc already, so this no-ops.
  useEffect(() => {
    const v = view.current
    if (!v) return
    const change = minimalReplace(v.state.doc.toString(), value)
    if (change) v.dispatch({ changes: change })
  }, [value])

  // "Show in file": scroll to the applied edit and briefly highlight it; the next
  // click anywhere clears the highlight. Mirrors the document editor's reveal.
  useEffect(() => {
    const v = view.current
    if (!v || !revealPos) return
    const len = v.state.doc.length
    const from = Math.min(revealPos.from, len)
    const to = Math.min(revealPos.to, len)
    v.dispatch({
      effects: [
        EditorView.scrollIntoView(from, { y: 'center' }),
        ...(to > from ? [setReveal.of({ from, to })] : [])
      ]
    })
    if (to <= from) return
    const clear = (): void => view.current?.dispatch({ effects: setReveal.of(null) })
    window.addEventListener('pointerdown', clear, { once: true, capture: true })
    return () => window.removeEventListener('pointerdown', clear, true)
  }, [revealPos])

  return <div className="studio-cm" ref={host} />
}
