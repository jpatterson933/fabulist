import { useState } from 'react'
import type { StudioChange } from '@shared/types'
import { useStore } from '@/store'

const NO_CHANGES: StudioChange[] = []

/**
 * The version-control panel — the studio's analogue of VSCode's Source Control view.
 * It reads two lists off the store (working-tree "Changes" and staged "Staged changes",
 * both git-derived) and turns each row into a thin call to a store action. It is fully
 * self-contained: it owns only its collapse + discard-confirm state, and the heavy
 * lifting (git) lives behind the store, so the whole feature lifts out by dropping this
 * file and its sibling backend module.
 */
export default function StudioChanges(): React.JSX.Element {
  const changes = useStore((s) => s.studioChanges) ?? NO_CHANGES
  const staged = useStore((s) => s.studioStaged) ?? NO_CHANGES
  const stageAllChanges = useStore((s) => s.stageAllChanges)
  const unstageAllChanges = useStore((s) => s.unstageAllChanges)
  const discardAllChanges = useStore((s) => s.discardAllChanges)
  const commitStaged = useStore((s) => s.commitStaged)
  const openStudioDiff = useStore((s) => s.openStudioDiff)

  const [changesOpen, setChangesOpen] = useState(true)
  const [stagedOpen, setStagedOpen] = useState(true)
  // a pending destructive discard awaiting confirmation: a single file rel, or '*' for all
  const [confirm, setConfirm] = useState<string | null>(null)

  const empty = changes.length === 0 && staged.length === 0

  return (
    <div className="studio-changes">
      {staged.length > 0 && (
        <button className="studio-commit" onClick={() => void commitStaged()} title="Commit staged changes">
          <CheckIcon />
          Commit
        </button>
      )}

      {staged.length > 0 && (
        <Section
          label="Staged changes"
          count={staged.length}
          open={stagedOpen}
          onToggle={() => setStagedOpen((v) => !v)}
          actions={
            <>
              <ActionButton
                title="Open staged changes"
                onClick={() => openStudioDiff('staged', staged.map((c) => c.rel))}
              >
                <OpenDiffIcon />
              </ActionButton>
              <ActionButton title="Unstage all changes" onClick={() => void unstageAllChanges()}>
                <MinusIcon />
              </ActionButton>
            </>
          }
        >
          {staged.map((c) => (
            <StagedRow key={c.rel} change={c} />
          ))}
        </Section>
      )}

      <Section
        label="Changes"
        count={changes.length}
        open={changesOpen}
        onToggle={() => setChangesOpen((v) => !v)}
        actions={
          <>
            <ActionButton
              title="Open changes"
              onClick={() => openStudioDiff('changes', changes.map((c) => c.rel))}
              disabled={changes.length === 0}
            >
              <OpenDiffIcon />
            </ActionButton>
            <ActionButton
              title="Discard all changes"
              onClick={() => setConfirm('*')}
              disabled={changes.length === 0}
            >
              <DiscardIcon />
            </ActionButton>
            <ActionButton title="Stage all changes" onClick={() => void stageAllChanges()} disabled={changes.length === 0}>
              <PlusIcon />
            </ActionButton>
          </>
        }
      >
        {confirm === '*' && (
          <ConfirmRow
            label="Discard all changes? This can’t be undone."
            confirmLabel="Discard all"
            onConfirm={() => {
              setConfirm(null)
              void discardAllChanges()
            }}
            onCancel={() => setConfirm(null)}
          />
        )}
        {changes.map((c) => (
          <ChangeRow
            key={c.rel}
            change={c}
            confirming={confirm === c.rel}
            onAskDiscard={() => setConfirm(c.rel)}
            onCancelDiscard={() => setConfirm(null)}
          />
        ))}
      </Section>

      {empty && <p className="studio-changes-empty">No changes. Edits you make show up here.</p>}
    </div>
  )
}

function Section({
  label,
  count,
  open,
  onToggle,
  actions,
  children
}: {
  label: string
  count: number
  open: boolean
  onToggle: () => void
  actions: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="studio-changes-section">
      <div className="studio-changes-head">
        <button className="studio-changes-title" onClick={onToggle}>
          <Chevron open={open} />
          {label}
          <span className="studio-changes-count">{count}</span>
        </button>
        <div className="studio-changes-actions">{actions}</div>
      </div>
      {open && <ul className="studio-changes-list">{children}</ul>}
    </div>
  )
}

function ChangeRow({
  change,
  confirming,
  onAskDiscard,
  onCancelDiscard
}: {
  change: StudioChange
  confirming: boolean
  onAskDiscard: () => void
  onCancelDiscard: () => void
}): React.JSX.Element {
  const openStudioDiff = useStore((s) => s.openStudioDiff)
  const openStudioFile = useStore((s) => s.openStudioFile)
  const stageChange = useStore((s) => s.stageChange)
  const discardChange = useStore((s) => s.discardChange)
  return (
    <Row change={change} onOpen={() => openStudioDiff('changes', [change.rel])}>
      {confirming ? (
        <ConfirmActions onConfirm={() => void discardChange(change.rel)} onCancel={onCancelDiscard} />
      ) : (
        <>
          <RowButton title="Open file" onClick={() => void openStudioFile(change.rel)}>
            <EditIcon />
          </RowButton>
          <RowButton title="Discard changes" onClick={onAskDiscard}>
            <DiscardIcon />
          </RowButton>
          <RowButton title="Stage changes" onClick={() => void stageChange(change.rel)}>
            <PlusIcon />
          </RowButton>
        </>
      )}
    </Row>
  )
}

function StagedRow({ change }: { change: StudioChange }): React.JSX.Element {
  const openStudioDiff = useStore((s) => s.openStudioDiff)
  const openStudioFile = useStore((s) => s.openStudioFile)
  const unstageChange = useStore((s) => s.unstageChange)
  return (
    <Row change={change} onOpen={() => openStudioDiff('staged', [change.rel])}>
      <RowButton title="Open file" onClick={() => void openStudioFile(change.rel)}>
        <EditIcon />
      </RowButton>
      <RowButton title="Unstage changes" onClick={() => void unstageChange(change.rel)}>
        <MinusIcon />
      </RowButton>
    </Row>
  )
}

/** Shared row chrome: status glyph + clickable name/path (opens the diff) + trailing actions. */
function Row({
  change,
  onOpen,
  children
}: {
  change: StudioChange
  onOpen: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const name = change.rel.split('/').pop() ?? change.rel
  const dir = change.rel.slice(0, change.rel.length - name.length)
  return (
    <li className="studio-change">
      <button className="studio-change-main" onClick={onOpen} title={change.rel}>
        <span className={`studio-change-badge status-${change.status}`}>{STATUS_GLYPH[change.status]}</span>
        <span className="studio-change-name">{name}</span>
        {dir && <span className="studio-change-path">{dir.replace(/\/$/, '')}</span>}
      </button>
      <div className="studio-change-actions">{children}</div>
    </li>
  )
}

/** A bulk-action icon button in a section header. */
function ActionButton({
  title,
  onClick,
  disabled,
  children
}: {
  title: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button className="btn-ghost btn-icon" onClick={onClick} title={title} aria-label={title} disabled={disabled}>
      {children}
    </button>
  )
}

/** A per-row action icon button. */
function RowButton({
  title,
  onClick,
  children
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button className="studio-change-act" title={title} aria-label={title} onClick={onClick}>
      {children}
    </button>
  )
}

function ConfirmActions({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }): React.JSX.Element {
  return (
    <div className="studio-change-confirm">
      <button className="danger" onClick={onConfirm}>
        Discard
      </button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  )
}

function ConfirmRow({
  label,
  confirmLabel,
  onConfirm,
  onCancel
}: {
  label: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}): React.JSX.Element {
  return (
    <li className="studio-change-confirm-row">
      <span>{label}</span>
      <div className="studio-change-confirm">
        <button className="danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </li>
  )
}

const STATUS_GLYPH: Record<StudioChange['status'], string> = {
  created: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R'
}

function Chevron({ open }: { open: boolean }): React.JSX.Element {
  return (
    <svg
      className={`studio-file-chevron ${open ? '' : 'is-collapsed'}`}
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
    >
      <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function OpenDiffIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="3" width="5" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="3" width="5" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function EditIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M10.5 3.5l2 2L6 12l-2.5.5L4 10l6.5-6.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PlusIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function MinusIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function DiscardIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M5 4.5 3 6.5l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M3 6.5h6.5a3 3 0 0 1 0 6H6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CheckIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
