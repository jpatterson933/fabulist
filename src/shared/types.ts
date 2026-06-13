// Shared contract between main, preload, and renderer.

export interface DocMeta {
  id: string // folder name
  title: string
  path: string
  createdAt: number
  updatedAt: number
  wordCount: number
  preview: string
}

export interface CommentMessage {
  id: string
  author: 'you' | 'claude'
  text: string
  at: number
}

export interface CommentAnchor {
  /** The exact quoted text the thread is attached to */
  text: string
  /** Up to 32 chars before/after the quote, for re-anchoring */
  prefix: string
  suffix: string
  from: number
  to: number
}

export interface CommentThread {
  id: string
  anchor: CommentAnchor
  status: 'open' | 'resolved' | 'orphaned'
  createdAt: number
  messages: CommentMessage[]
}

export interface CommitInfo {
  hash: string
  subject: string
  at: number // unix seconds
}

export interface VersionPreview {
  hash: string
  content: string
}

/** A permission request surfaced to the user for approval */
export interface PermissionRequest {
  requestId: string
  docId: string
  tool: string
  /** Relative path of the file being changed, if a file tool */
  filePath?: string
  /** For file edits: text being replaced / replacement (or whole file for Write) */
  before?: string
  after?: string
  /** Structured edit list (Edit/MultiEdit) — lets the editor render inline suggestions */
  edits?: { old: string; new: string; all?: boolean }[]
  /** For Bash: the command */
  command?: string
  /** For AskUserQuestion: choices to put to the author; answered, not approved */
  questions?: {
    question: string
    header: string
    multiSelect?: boolean
    options: { label: string; description?: string }[]
  }[]
  /** Human summary line */
  summary: string
}

export type AgentEvent =
  | { kind: 'status'; docId: string; status: 'idle' | 'starting' | 'working' | 'done' | 'error'; detail?: string }
  | { kind: 'user-echo'; docId: string; itemId: string; text: string; quote?: string }
  | { kind: 'text-delta'; docId: string; itemId: string; delta: string }
  | { kind: 'assistant-text'; docId: string; itemId: string; text: string }
  | { kind: 'tool-note'; docId: string; itemId: string; toolId: string; note: string; done?: boolean; ok?: boolean }
  | { kind: 'permission-request'; docId: string; request: PermissionRequest }
  /** an edit applied without review (auto-apply mode) — informational record */
  | { kind: 'edit-applied'; docId: string; request: PermissionRequest }
  | { kind: 'permission-resolved'; docId: string; requestId: string; approved: boolean }
  | {
      kind: 'result'
      docId: string
      ok: boolean
      text?: string
      error?: string
      costUsd?: number
      durationMs?: number
      commentId?: string
    }

export interface ChatItem {
  id: string
  role: 'user' | 'assistant'
  text: string
  quote?: string
  at: number
  /** tool activity lines shown under an assistant item */
  toolNotes?: { toolId: string; note: string; done?: boolean; ok?: boolean }[]
  /** an auto-applied edit, rendered as a collapsed diff card */
  edit?: { tool: string; filePath?: string; before: string; after: string }
  streaming?: boolean
  error?: string
}

export interface ModelChoice {
  value: string // Claude Code model alias or full model id; '' = CLI default
  label: string
  hint: string
}

export const DEFAULT_MODEL_CHOICE: ModelChoice = {
  value: '',
  label: 'Default',
  hint: 'whatever your Claude Code is set to'
}

/** Used only when the engine can't be asked (listing failed) */
export const FALLBACK_MODEL_CHOICES: ModelChoice[] = [
  DEFAULT_MODEL_CHOICE,
  { value: 'opus', label: 'Opus', hint: 'deepest reasoning' },
  { value: 'sonnet', label: 'Sonnet', hint: 'balanced' },
  { value: 'haiku', label: 'Haiku', hint: 'fastest' }
]

export interface FontChoice {
  value: string
  label: string
  stack: string
}

export const FONT_CHOICES: FontChoice[] = [
  { value: 'newsreader', label: 'Newsreader', stack: "'Newsreader Variable', 'Iowan Old Style', Georgia, serif" },
  { value: 'literata', label: 'Literata', stack: "'Literata Variable', Georgia, serif" },
  { value: 'fraunces', label: 'Fraunces', stack: "'Fraunces Variable', 'Iowan Old Style', serif" },
  { value: 'plex-sans', label: 'Plex Sans', stack: "'IBM Plex Sans', 'Avenir Next', sans-serif" },
  { value: 'plex-mono', label: 'Plex Mono', stack: "'IBM Plex Mono', 'SF Mono', monospace" }
]

export const DEFAULT_FONT = FONT_CHOICES[0].value

/** An installed skill — read straight from its SKILL.md frontmatter */
export interface SkillMeta {
  /** library folder name */
  slug: string
  name: string
  description: string
}

export interface DocSkill {
  skill: SkillMeta
  /** enabled for the current document */
  enabled: boolean
}

export interface SendOptions {
  /** When set, Claude's final reply is also appended to this comment thread */
  commentId?: string
  /** Selected text the user is asking about */
  quote?: string
}
