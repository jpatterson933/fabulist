import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorView } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { FONT_CHOICES } from '@shared/types'
import { useStore } from '@/store'
import { makeAnchor } from '@/lib/anchors'
import { minimalReplace } from '@/lib/externalMerge'
import { computeSuggestion } from '@/lib/suggest'
import {
  baseExtensions,
  setThreadRanges,
  setSuggestion,
  currentThreadRanges,
  externalChange,
  type ThreadRange
} from '@/editor/extensions'

interface SelectionInfo {
  from: number
  to: number
  left: number
  top: number
}

export default function Editor({ docId }: { docId: string }): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [selection, setSelection] = useState<SelectionInfo | null>(null)
  const selTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editable = useRef(new Compartment()).current

  const external = useStore((s) => s.external)
  const threads = useStore((s) => s.threads)
  const activeThreadId = useStore((s) => s.activeThreadId)
  const draftComment = useStore((s) => s.draftComment)
  const scrollTo = useStore((s) => s.scrollTo)
  const revealPos = useStore((s) => s.revealPos)
  const permissions = useStore((s) => s.permissions)
  const content = useStore((s) => s.content)
  const respondPermission = useStore((s) => s.respondPermission)

  const appliedSeq = useRef(0)

  // a pending document.md permission rendered as an in-document suggestion
  const suggestion = useMemo(() => {
    const req = permissions.find((p) => p.docId === docId && p.filePath === 'document.md')
    if (!req) return null
    const segments = computeSuggestion(content, req)
    return segments ? { requestId: req.requestId, segments } : null
  }, [permissions, content, docId])

  // create the view once per document
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const state = useStore.getState()

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: state.content,
        extensions: [
          ...baseExtensions(),
          editable.of([]),
          EditorView.updateListener.of((update) => {
            const isExternal = update.transactions.some((tr) => tr.annotation(externalChange))
            if (update.docChanged && !isExternal) {
              // external replaces already updated the store and re-anchored
              // threads by quote — mapped ranges across them are garbage
              useStore.getState().setContent(update.state.doc.toString())
              useStore.getState().persistAnchors(currentThreadRanges(update.state))
            }
            if (update.selectionSet || update.docChanged) {
              if (selTimer.current) clearTimeout(selTimer.current)
              selTimer.current = setTimeout(() => {
                const sel = update.state.selection.main
                if (sel.empty) {
                  setSelection(null)
                  return
                }
                const view2 = viewRef.current
                if (!view2) return
                const start = view2.coordsAtPos(Math.min(sel.from, sel.to))
                const box = host.getBoundingClientRect()
                if (!start) return setSelection(null)
                setSelection({
                  from: sel.from,
                  to: sel.to,
                  left: Math.max(12, start.left - box.left),
                  top: start.top - box.top
                })
              }, 120)
            }
          }),
          EditorView.domEventHandlers({
            mousedown: (event, view2) => {
              const el = (event.target as HTMLElement).closest?.('[data-thread]')
              const id = el?.getAttribute('data-thread')
              if (id && id !== '__draft') useStore.getState().jumpToThread(id)
              return false
            }
          })
        ]
      })
    })
    viewRef.current = view
    if (external) appliedSeq.current = external.seq
    return () => {
      view.destroy()
      viewRef.current = null
      useStore.getState().setInlineSuggestion(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId])

  // apply external content updates (Claude edits, restores, doc switches)
  useEffect(() => {
    const view = viewRef.current
    if (!view || !external || external.seq <= appliedSeq.current) return
    appliedSeq.current = external.seq
    // minimal span instead of a whole-doc replace: CodeMirror maps the scroll
    // position and selection through the change, so the viewport stays put
    const change = minimalReplace(view.state.doc.toString(), external.content)
    if (change) {
      view.dispatch({
        changes: change,
        annotations: externalChange.of(true)
      })
    }
  }, [external])

  // push thread ranges into the editor whenever they change;
  // a draft being composed highlights immediately, like Google Docs
  const ranges = useMemo<ThreadRange[]>(() => {
    const out: ThreadRange[] = threads
      .filter((t) => t.status === 'open')
      .map((t) => ({
        id: t.id,
        from: t.anchor.from,
        to: t.anchor.to,
        active: t.id === activeThreadId
      }))
    if (draftComment) {
      out.push({
        id: '__draft',
        from: draftComment.anchor.from,
        to: draftComment.anchor.to,
        active: true
      })
    }
    return out
  }, [threads, activeThreadId, draftComment])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: setThreadRanges.of(ranges) })
  }, [ranges])

  // render the pending suggestion inline; lock the doc while it's under review
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: [
        setSuggestion.of(suggestion?.segments ?? null),
        editable.reconfigure(
          suggestion ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []
        )
      ]
    })
    useStore.getState().setInlineSuggestion(suggestion?.requestId ?? null)
    if (suggestion && suggestion.segments.length > 0) {
      const first = Math.min(suggestion.segments[0].from, view.state.doc.length)
      view.dispatch({ effects: EditorView.scrollIntoView(first, { y: 'center' }) })
      setSelection(null)
    }
  }, [suggestion, editable])

  // keyboard: ⌘⏎ accepts, esc declines the pending suggestion
  useEffect(() => {
    if (!suggestion) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        respondPermission(suggestion.requestId, true)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        respondPermission(suggestion.requestId, false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [suggestion, respondPermission])

  // scroll to an applied edit when the user asks ("Show in document")
  useEffect(() => {
    const view = viewRef.current
    if (!view || !revealPos) return
    const pos = Math.min(revealPos.pos, view.state.doc.length)
    view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) })
  }, [revealPos])

  // scroll to a thread when asked
  useEffect(() => {
    const view = viewRef.current
    if (!view || !scrollTo) return
    const t = useStore.getState().threads.find((x) => x.id === scrollTo.threadId)
    if (!t || t.anchor.from >= view.state.doc.length) return
    view.dispatch({ effects: EditorView.scrollIntoView(t.anchor.from, { y: 'center' }) })
  }, [scrollTo])

  const onComment = (): void => {
    if (!selection) return
    const content = useStore.getState().content
    useStore.getState().startDraftComment(makeAnchor(content, selection.from, selection.to))
    setSelection(null)
  }

  const font = useStore((s) => s.font)
  const fontStack = (FONT_CHOICES.find((f) => f.value === font) ?? FONT_CHOICES[0]).stack

  return (
    <div
      className={`editor-host ${activeThreadId ? 'has-active-thread' : ''}`}
      style={{ '--font-serif': fontStack } as React.CSSProperties}
      ref={hostRef}
    >
      {suggestion && (
        <div className="suggest-bar">
          <span className="suggest-bar-glyph" aria-hidden>
            ✦
          </span>
          <span className="suggest-bar-label">Claude suggests an edit</span>
          <button
            className="btn-primary btn-small"
            onClick={() => respondPermission(suggestion.requestId, true)}
            title="Accept  ⌘⏎"
          >
            Accept
          </button>
          <button
            className="btn-ghost btn-small"
            onClick={() => respondPermission(suggestion.requestId, false)}
            title="Decline  esc"
          >
            Decline
          </button>
        </div>
      )}
      {selection && !suggestion && (
        <div
          className="selection-toolbar"
          style={{ left: selection.left, top: Math.max(8, selection.top - 46) }}
        >
          <button onClick={onComment} title="Comment — Claude reads every comment and replies in the thread">
            <MarkIcon /> Comment
          </button>
        </div>
      )}
    </div>
  )
}

function MarkIcon(): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 3.5h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H8l-3 3v-3H3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

