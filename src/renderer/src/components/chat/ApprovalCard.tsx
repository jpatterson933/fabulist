import { useState } from 'react'
import type { PermissionRequest } from '@shared/types'
import { isPrimaryDoc } from '@shared/doc'
import { useStore } from '@/store'
import DiffView from '@/components/DiffView'

// The approval surface, extracted from ChatPanel: a command/diff approval card
// and the AskUserQuestion card. ApprovalCard dispatches on request.kind. The
// optional `respond` lets a second agent (the Plugin Studio) route answers to its
// own IPC channel; it defaults to the document agent's respondPermission.

type Responder = (requestId: string, approved: boolean, answers?: Record<string, string>) => void

function QuestionCard({
  request,
  respond
}: {
  request: PermissionRequest
  respond: Responder
}): React.JSX.Element {
  const questions = request.questions!
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [custom, setCustom] = useState<Record<string, string>>({})

  const resolveAnswers = (
    sel: Record<string, string[]>,
    customAnswers: Record<string, string>
  ): Record<string, string> =>
    Object.fromEntries(
      questions.map((q) => {
        const typed = customAnswers[q.question]?.trim()
        return [q.question, typed || (sel[q.question] ?? []).join(', ')]
      })
    )

  const submitAnswers = (sel: Record<string, string[]>, customAnswers: Record<string, string>): void => {
    respond(request.requestId, true, resolveAnswers(sel, customAnswers))
  }

  const toggle = (q: (typeof questions)[number], label: string): void => {
    const cur = picked[q.question] ?? []
    const nextSel = { ...picked, [q.question]: q.multiSelect
      ? cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label]
      : [label] }
    const nextCustom = { ...custom, [q.question]: '' }
    setPicked(nextSel)
    setCustom(nextCustom)
    // a lone single-choice question answers on click — no extra Send step
    if (!q.multiSelect && questions.length === 1) submitAnswers(nextSel, nextCustom)
  }

  const setCustomAnswer = (question: string, text: string): void => {
    setCustom((prev) => ({ ...prev, [question]: text }))
    if (text.trim()) setPicked((prev) => ({ ...prev, [question]: [] }))
  }

  const complete = questions.every((q) => {
    const typed = custom[q.question]?.trim()
    return Boolean(typed) || (picked[q.question] ?? []).length > 0
  })
  const needsSendButton =
    questions.length > 1 ||
    questions.some((q) => q.multiSelect) ||
    questions.some((q) => (custom[q.question] ?? '').trim().length > 0)

  return (
    <div className="approval approval-question">
      <div className="approval-head">
        <span className="approval-kind">Claude is asking</span>
        <span className="approval-tool">{request.tool}</span>
      </div>
      {questions.map((q) => (
        <div key={q.question} className="question-block">
          {q.header && <span className="question-chip">{q.header}</span>}
          <p className="question-text">{q.question}</p>
          <div className="question-options">
            {q.options.map((o) => {
              const on = (picked[q.question] ?? []).includes(o.label)
              return (
                <button
                  key={o.label}
                  className={`question-option${on ? ' is-picked' : ''}`}
                  title={o.description}
                  onClick={() => toggle(q, o.label)}
                >
                  <span className="question-option-label">{o.label}</span>
                  {o.description && <span className="question-option-desc">{o.description}</span>}
                </button>
              )
            })}
          </div>
          <input
            className="question-custom-input"
            type="text"
            value={custom[q.question] ?? ''}
            placeholder="Or type your own answer…"
            onChange={(e) => setCustomAnswer(q.question, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && complete && needsSendButton) {
                e.preventDefault()
                submitAnswers(picked, custom)
              }
            }}
          />
        </div>
      ))}
      <div className="approval-actions">
        {needsSendButton && (
          <button className="btn-primary" disabled={!complete} onClick={() => submitAnswers(picked, custom)}>
            Send answers
          </button>
        )}
        <button className="btn-ghost" onClick={() => respond(request.requestId, false)}>
          Skip
        </button>
      </div>
    </div>
  )
}

export function ApprovalCard({
  request,
  respond,
  inline
}: {
  request: PermissionRequest
  respond?: Responder
  /** force the compact "shown inline" form (the Plugin Studio computes this itself);
   *  the document app omits it and falls back to the store's inlineSuggestionId */
  inline?: boolean
}): React.JSX.Element {
  const storeRespond = useStore((s) => s.respondPermission)
  const doRespond = respond ?? storeRespond
  const storeInline = useStore((s) => s.inlineSuggestionId === request.requestId)
  const shownInline = inline ?? storeInline

  if (request.kind === 'question' || request.questions)
    return <QuestionCard request={request} respond={doRespond} />
  const isDocEdit = isPrimaryDoc(request.filePath)
  const isWholeFile = request.tool === 'Write'

  // the suggestion is rendered in the document itself — keep chat compact
  if (shownInline) {
    return (
      <div className="approval approval-inline">
        <div className="approval-head">
          <span className="approval-kind">Suggested edit — shown in the editor</span>
          <span className="approval-tool">{request.tool}</span>
        </div>
        <div className="approval-actions">
          <button className="btn-primary" onClick={() => doRespond(request.requestId, true)}>
            Accept
          </button>
          <button className="btn-ghost" onClick={() => doRespond(request.requestId, false)}>
            Decline
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="approval">
      <div className="approval-head">
        <span className="approval-kind">
          {request.command ? 'Run command' : isDocEdit ? 'Edit document' : `Change ${request.filePath ?? 'files'}`}
        </span>
        <span className="approval-tool">{request.tool}</span>
      </div>

      {request.command ? (
        <pre className="approval-command">{request.command}</pre>
      ) : request.before !== undefined || request.after !== undefined ? (
        <div className="approval-diff">
          <DiffView
            before={request.before ?? ''}
            after={request.after ?? ''}
            mode={isWholeFile ? 'lines' : 'words'}
          />
        </div>
      ) : (
        <p className="approval-summary">{request.summary}</p>
      )}

      <div className="approval-actions">
        <button className="btn-primary" onClick={() => doRespond(request.requestId, true)}>
          Apply
        </button>
        <button className="btn-ghost" onClick={() => doRespond(request.requestId, false)}>
          Decline
        </button>
      </div>
    </div>
  )
}
