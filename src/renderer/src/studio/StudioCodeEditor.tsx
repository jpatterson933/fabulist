import { useEffect, useRef } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState, Compartment, type Extension } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting } from '@codemirror/language'
import { useStore } from '@/store'
import { setReveal, revealField, setSuggestion, suggestionField, externalChange } from '@/editor/extensions'
import { editorPowerFeatures } from '@/editor/powerEditing'
import { minimalReplace } from '@/lib/externalMerge'
import type { SuggestSegment } from '@/lib/suggest'
import { neonMarkdownHighlight, studioEditorTheme } from './markdownTheme'
import { subtleLineNumbers } from './studioLineNumbers'

// Remember each file's scroll position across remounts (the editor is keyed by file
// upstream, so switching files away and back would otherwise start at the top). Keyed by
// `scrollKey` (skill + file); in-memory for the session. We store CodeMirror's own scroll
// SNAPSHOT (anchored to a document position) rather than a raw pixel offset: restoring it
// goes through CodeMirror's measure cycle, so it lands exactly — even at the bottom of a
// long file, where setting a pixel scrollTop before line heights are measured gets clamped.
const scrollMemory = new Map<string, ReturnType<EditorView['scrollSnapshot']>>()

/**
 * A lean CodeMirror editor for the Plugin Studio. For `.md` files it adds Markdown
 * syntax highlighting whose per-element styling is entirely CSS-driven (see
 * markdownTheme.ts → `.studio .cm-md-*` in global.css), so the look is modular and
 * swappable without touching this component. Keyed by `path` upstream, so each file
 * remounts with a fresh editor state; `scrollKey` lets it restore where you'd scrolled.
 *
 * `revealPos` carries a "Show in file" request from the chat: scroll to + briefly
 * highlight an applied edit. It reuses the editor's transient revealField/setReveal,
 * the same mechanism the document editor uses (and takes precedence over scroll restore).
 *
 * `suggestion` carries Claude's PENDING edit (when auto-apply is off): the word-level
 * diff is painted inline — deletions struck through in red, insertions in green — and
 * the buffer is locked while it's under review. This is the same overlay the document
 * editor uses (suggestionField/setSuggestion); the parent owns matching the pending
 * permission to the open file and the Accept/Decline affordance.
 */
export default function StudioCodeEditor({
  path,
  value,
  scrollKey,
  revealPos,
  suggestion,
  onChange,
  onSelect
}: {
  path: string
  value: string
  /** stable per-file id (skill + file) used to remember/restore scroll position */
  scrollKey: string
  revealPos?: { from: number; to: number; seq: number } | null
  /** Claude's pending edit to this file, rendered inline; null when none is awaiting review */
  suggestion?: SuggestSegment[] | null
  onChange: (next: string) => void
  onSelect: (selected: string) => void
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  // line-wrapping is an app-wide toggle (⌥Z), reconfigured live via its own compartment
  const wrap = useStore((s) => s.studioWrap)
  const wrapComp = useRef(new Compartment()).current
  const wrapRef = useRef(wrap)
  wrapRef.current = wrap
  // toggles the buffer read-only while a suggestion is under review (same as the doc editor)
  const editable = useRef(new Compartment()).current
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
    // Restore the scroll position at CONSTRUCTION (unless a "Show in file" reveal wants us
    // elsewhere). Passing the saved snapshot via `scrollTo` — rather than dispatching it
    // after creation — makes CodeMirror build its FIRST viewport around that position and
    // measure those line heights before it paints, so it lands exactly, even at the bottom
    // of a long file. A post-creation dispatch instead races the initial render, which has
    // already laid out at the top using only estimated off-screen heights — so a bottom
    // anchor resolves against a wrong height map and snaps to (or near) the top.
    const saved = revealPosRef.current ? undefined : scrollMemory.get(scrollKey)
    const v = new EditorView({
      parent: host.current,
      scrollTo: saved,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          wrapComp.of(wrapRef.current ? EditorView.lineWrapping : []),
          lang,
          syntaxHighlighting(neonMarkdownHighlight),
          studioEditorTheme,
          subtleLineNumbers,
          // Find (⌘F), multi-cursor (⌘D), column select, Tab-to-indent —
          // the same self-contained pack the writing editor uses.
          ...editorPowerFeatures(),
          revealField,
          suggestionField,
          editable.of([]),
          EditorView.updateListener.of((u) => {
            // programmatic syncs (agent edits, reloads, optimistic applies, auto-format)
            // carry the externalChange annotation — only echo genuine user typing back
            // to the store, so a sync can't spuriously mark the file dirty
            const isExternal = u.transactions.some((tr) => tr.annotation(externalChange))
            if (u.docChanged && !isExternal) onChangeRef.current(u.state.doc.toString())
            if (u.selectionSet || u.docChanged) {
              const sel = u.state.selection.main
              onSelectRef.current(sel.empty ? '' : u.state.sliceDoc(sel.from, sel.to))
            }
          })
        ]
      })
    })
    view.current = v
    // Persist the scroll position ONLY from real scroll events — never on teardown. Two traps
    // make a teardown-time capture wrong: (1) React runs an unmount's cleanup after it has
    // already detached the DOM, and a detached element reports scrollTop 0; (2) under
    // StrictMode (dev) every mount is setup→cleanup→setup, and that throwaway cleanup runs
    // while still attached but BEFORE scrollTo has applied, so it captures 0 and clobbers the
    // real saved value — which is exactly why it kept snapping to the top. A scroll event only
    // ever fires at a genuine position (including the programmatic scroll from a restore), so
    // capturing there is the one source of truth that survives both traps.
    const remember = (): void => {
      scrollMemory.set(scrollKeyRef.current, v.scrollSnapshot())
    }
    v.scrollDOM.addEventListener('scroll', remember, { passive: true })
    return () => {
      v.scrollDOM.removeEventListener('scroll', remember)
      v.destroy()
      view.current = null
    }
    // value is the initial doc only; later changes flow through the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  // live ⌥Z wrap toggle — reconfigure the compartment in place, no editor rebuild
  useEffect(() => {
    view.current?.dispatch({ effects: wrapComp.reconfigure(wrap ? EditorView.lineWrapping : []) })
  }, [wrap, wrapComp])

  // external content changes (agent edits, auto-format, reloads) — sync the doc in place.
  // Use a minimal single-span replace, not a whole-doc swap, so CodeMirror maps the scroll
  // position through the change and the viewport stays put (no snap to the top on format).
  // When the user types, `value` equals the doc already, so this no-ops.
  useEffect(() => {
    const v = view.current
    if (!v) return
    const change = minimalReplace(v.state.doc.toString(), value)
    if (change) v.dispatch({ changes: change, annotations: externalChange.of(true) })
  }, [value])

  // render Claude's pending edit inline (deletions struck red, insertions green) and
  // lock the buffer while it's under review — the same overlay + lock the document
  // editor uses (Editor.tsx). The parent clears `suggestion` once the edit resolves.
  useEffect(() => {
    const v = view.current
    if (!v) return
    const active = suggestion && suggestion.length > 0
    v.dispatch({
      effects: [
        setSuggestion.of(suggestion ?? null),
        editable.reconfigure(
          active ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []
        )
      ]
    })
    if (active) {
      const first = Math.min(suggestion![0].from, v.state.doc.length)
      v.dispatch({ effects: EditorView.scrollIntoView(first, { y: 'center' }) })
    }
  }, [suggestion, editable])

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
