import { useState } from 'react'
import type { PermissionRequest } from '@shared/types'
import { isPrimaryDoc } from '@shared/doc'
import { useStore } from '@/store'
import DiffView from '@/components/DiffView'

// The approval surface, extracted from ChatPanel: a command/diff approval card
// and the AskUserQuestion card. ApprovalCard dispatches on request.kind.

function QuestionCard({ request }: { request: PermissionRequest }): React.JSX.Element {
  const respond = useStore((s) => s.respondPermission)
  const questions = request.questions!
  const [picked, setPicked] = useState<Record<string, string[]>>({})

  const submit = (sel: Record<string, string[]>): void => {
    const answers = Object.fromEntries(
      questions.map((q) => [q.question, (sel[q.question] ?? []).join(', ')])
    )
    respond(request.requestId, true, answers)
  }

  const toggle = (q: (typeof questions)[number], label: string): void => {
    const next = { ...picked }
    const cur = next[q.question] ?? []
    if (q.multiSelect) {
      next[q.question] = cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label]
    } else {
      next[q.question] = [label]
      // a lone single-choice question answers on click — no extra Send step
      if (questions.length === 1) return submit(next)
    }
    setPicked(next)
  }

  const complete = questions.every((q) => (picked[q.question] ?? []).length > 0)

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
        </div>
      ))}
      <div className="approval-actions">
        {(questions.length > 1 || questions.some((q) => q.multiSelect)) && (
          <button className="btn-primary" disabled={!complete} onClick={() => submit(picked)}>
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

export function ApprovalCard({ request }: { request: PermissionRequest }): React.JSX.Element {
  const respond = useStore((s) => s.respondPermission)
  const shownInline = useStore((s) => s.inlineSuggestionId === request.requestId)

  if (request.kind === 'question' || request.questions) return <QuestionCard request={request} />
  const isDocEdit = isPrimaryDoc(request.filePath)
  const isWholeFile = request.tool === 'Write'

  // the suggestion is rendered in the document itself — keep chat compact
  if (shownInline) {
    return (
      <div className="approval approval-inline">
        <div className="approval-head">
          <span className="approval-kind">Suggested edit — shown in the document</span>
          <span className="approval-tool">{request.tool}</span>
        </div>
        <div className="approval-actions">
          <button className="btn-primary" onClick={() => respond(request.requestId, true)}>
            Accept
          </button>
          <button className="btn-ghost" onClick={() => respond(request.requestId, false)}>
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
        <button className="btn-primary" onClick={() => respond(request.requestId, true)}>
          Apply
        </button>
        <button className="btn-ghost" onClick={() => respond(request.requestId, false)}>
          Decline
        </button>
      </div>
    </div>
  )
}
