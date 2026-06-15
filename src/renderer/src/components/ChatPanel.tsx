import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DocSkill } from '@shared/types'
import { useStore } from '@/store'
import { selectChat } from '@/store/selectors'
import SkillsPanel from '@/components/SkillsPanel'
import { AttachChips, useAttachments } from '@/lib/useAttachments'
import { useStickToBottom } from '@/lib/useStickToBottom'
import { ApprovalCard } from '@/components/chat/ApprovalCard'
import { ChatBubble, EditGroupCard, groupConsecutiveEdits } from '@/components/chat/Messages'
import { ModelPicker, AutoApproveToggle, PlusMenu } from '@/components/chat/ComposeOptions'
import { slashTokenAt } from '@/lib/slash'

export default function ChatPanel({ docId }: { docId: string }): React.JSX.Element {
  const chat = useStore(selectChat(docId))
  const allPermissions = useStore((s) => s.permissions)
  const permissions = useMemo(
    () => allPermissions.filter((p) => p.docId === docId),
    [allPermissions, docId]
  )
  const agent = useStore((s) => s.agent[docId])
  const askClaude = useStore((s) => s.askClaude)
  const interrupt = useStore((s) => s.interrupt)

  const [input, setInput] = useState('')
  const attachments = useAttachments(docId)
  const [skills, setSkills] = useState<DocSkill[]>([])
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [slash, setSlash] = useState<{ start: number; query: string } | null>(null)
  const [slashSel, setSlashSel] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // follow new output only while the user is at (or near) the bottom —
  // scrolling up to read pauses the auto-scroll until they return
  const { scrollRef, onScroll, stick } = useStickToBottom([chat, permissions])

  const busy = agent?.status === 'starting' || agent?.status === 'working'

  const refreshSkills = useCallback(() => {
    window.fabulist.skills
      .listForDoc(docId)
      .then(setSkills)
      .catch(() => setSkills([]))
  }, [docId])

  useEffect(refreshSkills, [refreshSkills])

  // a new approval card must never sit out of sight below the fold — pin to it
  // even if the user had scrolled up to read (the hook's effect then scrolls)
  const prevPermCount = useRef(0)
  if (permissions.length > prevPermCount.current) stick()
  prevPermCount.current = permissions.length

  const send = (): void => {
    if ((!input.trim() && attachments.paths.length === 0) || busy) return
    stick() // sending always jumps to the latest
    void askClaude(attachments.consume(input))
    setInput('')
    setSlash(null)
  }

  // --- `/` autocomplete over the skills enabled for this document ---

  const matches = useMemo(() => {
    if (slash === null) return []
    const q = slash.query.toLowerCase()
    return skills
      .filter((s) => s.enabled)
      .filter((s) => s.skill.slug.includes(q) || s.skill.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [skills, slash])

  // matches plus the trailing "Manage skills…" row
  const menuLength = slash === null ? 0 : matches.length + 1

  const syncSlash = (text: string, caret: number): void => {
    const token = slashTokenAt(text, caret)
    setSlash(token)
    if (token?.query !== slash?.query) setSlashSel(0)
  }

  const pickSlash = (index: number): void => {
    if (slash === null) return
    if (index >= matches.length) {
      setSkillsOpen(true)
      setSlash(null)
      return
    }
    const el = inputRef.current
    const caret = el?.selectionStart ?? input.length
    const inserted = `/${matches[index].skill.slug} `
    const next = input.slice(0, slash.start) + inserted + input.slice(caret)
    setInput(next)
    setSlash(null)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(slash.start + inserted.length, slash.start + inserted.length)
    })
  }

  const attachFiles = async (): Promise<void> => {
    const paths = await window.fabulist.doc.attachFiles(docId).catch(() => [])
    if (paths.length === 0) return
    attachments.add(paths)
    inputRef.current?.focus()
  }

  return (
    <div className="chat">
      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
        {chat.length === 0 && (
          <div className="chat-empty">
            <p>
              Claude knows this document — it lives in the project folder Claude works from.
              Ask for a read-through, a rewrite, research, or a sharper opening line.
            </p>
            <p className="chat-empty-hint">
              Or highlight any passage and comment on it — Claude reads every comment and
              replies in the thread.
            </p>
          </div>
        )}
        {groupConsecutiveEdits(chat).map((row) =>
          Array.isArray(row) ? (
            <EditGroupCard key={row[0].id} items={row} />
          ) : (
            <ChatBubble key={row.id} item={row} />
          )
        )}
        {permissions.map((p) => (
          <ApprovalCard key={p.requestId} request={p} />
        ))}
        {busy && (
          <div className="chat-working">
            <span className="agent-dot agent-working" />
            {agent?.detail ? agent.detail : 'Claude is working'}
            <button className="btn-ghost btn-small" onClick={interrupt}>
              Stop
            </button>
          </div>
        )}
      </div>

      <div className="chat-compose">
        <AttachChips attachments={attachments} />
        <div className="chat-inputrow">
          {slash !== null && (
            <div className="slash-menu" role="listbox">
              {matches.map((s, i) => (
                <button
                  key={s.skill.slug}
                  className={`slash-item${i === slashSel ? ' is-selected' : ''}`}
                  onMouseEnter={() => setSlashSel(i)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pickSlash(i)
                  }}
                >
                  <span className="slash-item-name">/{s.skill.slug}</span>
                  {s.skill.description && (
                    <span className="slash-item-desc">{s.skill.description}</span>
                  )}
                </button>
              ))}
              <button
                className={`slash-item slash-item-manage${slashSel === matches.length ? ' is-selected' : ''}`}
                onMouseEnter={() => setSlashSel(matches.length)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pickSlash(matches.length)
                }}
              >
                Manage skills…
              </button>
            </div>
          )}
          <textarea
            ref={inputRef}
            rows={Math.min(6, Math.max(1, input.split('\n').length))}
            value={input}
            placeholder={busy ? 'Claude is working…' : 'Ask Claude about this document…'}
            disabled={busy}
            onChange={(e) => {
              setInput(e.target.value)
              syncSlash(e.target.value, e.target.selectionStart ?? e.target.value.length)
            }}
            onClick={(e) => syncSlash(input, e.currentTarget.selectionStart ?? input.length)}
            onBlur={() => setSlash(null)}
            onPaste={attachments.onPaste}
            onKeyDown={(e) => {
              if (slash !== null && menuLength > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  return setSlashSel((v) => (v + 1) % menuLength)
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  return setSlashSel((v) => (v + menuLength - 1) % menuLength)
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault()
                  return pickSlash(slashSel)
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  return setSlash(null)
                }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          <button
            className="chat-send"
            onClick={send}
            disabled={busy || (!input.trim() && attachments.paths.length === 0)}
            title="Send"
          >
            ↑
          </button>
        </div>
        <div className="chat-options">
          <ModelPicker disabled={busy} />
          <PlusMenu onManageSkills={() => setSkillsOpen(true)} onAttachFiles={attachFiles} />
          <AutoApproveToggle />
        </div>
      </div>

      {skillsOpen && (
        <div
          className="modal-overlay"
          onClick={() => {
            setSkillsOpen(false)
            refreshSkills()
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span className="modal-title">Skills</span>
              <button
                className="btn-ghost btn-small"
                onClick={() => {
                  setSkillsOpen(false)
                  refreshSkills()
                }}
              >
                ✕
              </button>
            </div>
            <SkillsPanel docId={docId} />
          </div>
        </div>
      )}
    </div>
  )
}
