// Shared contract between main, preload, and renderer.

import type { DocType } from './docTypes'
export type { DocType }

/** A project is a folder under the library root; it holds one or more docs. */
export interface ProjectMeta {
  id: string // folder name
  title: string
  path: string
  docCount: number
  createdAt: number
  updatedAt: number
  updatedLabel?: string // most-recent doc title, for the rail subtitle
  /** studio name from fabulist.json, when the project defines a harness */
  studio?: string
}

export interface DocMeta {
  /** filename within the project, e.g. "chapter-1.md" — the doc's stable id */
  file: string
  /** the kind of doc, derived from the extension; only 'markdown' today */
  type: DocType
  title: string
  path: string // absolute path to the doc file
  createdAt: number
  updatedAt: number
  wordCount: number
  preview: string
  /** harness doc-type id when a studio's docTypes glob matches this file */
  kind?: string
  /** display label for the kind, e.g. "Scene" */
  kindLabel?: string
  /** rail glyph for the kind */
  kindIcon?: string
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
  projectId: string
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
  /** Human summary line */
  summary: string
}

export type AgentEvent =
  | { kind: 'status'; projectId: string; status: 'idle' | 'starting' | 'working' | 'done' | 'error'; detail?: string }
  | {
      kind: 'user-echo'
      projectId: string
      threadId: string
      itemId: string
      text: string
      quote?: string
      attachments?: string[]
    }
  | { kind: 'text-delta'; projectId: string; threadId: string; itemId: string; delta: string }
  | { kind: 'assistant-text'; projectId: string; threadId: string; itemId: string; text: string }
  | {
      kind: 'tool-note'
      projectId: string
      threadId: string
      itemId: string
      toolId: string
      note: string
      done?: boolean
      ok?: boolean
    }
  | { kind: 'permission-request'; projectId: string; request: PermissionRequest }
  | { kind: 'permission-resolved'; projectId: string; requestId: string; approved: boolean }
  | {
      kind: 'result'
      projectId: string
      threadId: string
      ok: boolean
      text?: string
      error?: string
      costUsd?: number
      durationMs?: number
      commentId?: string
      /** the doc a comment reply belongs to, so the renderer reloads it */
      docFile?: string
    }

/**
 * Everything the main process observes happening to the open project folder,
 * on one channel. Adding a signal is a new variant here plus a case in the
 * store's handleProjectEvent — no new IPC plumbing.
 */
export type ProjectEvent =
  | { kind: 'harness-changed'; projectId: string }
  | { kind: 'doc-external-change'; projectId: string; docFile: string; content: string }
  | { kind: 'doc-removed'; projectId: string; docFile: string }
  | { kind: 'comments-changed'; projectId: string }

/** Live state of one studio command (fabulist.json `commands`) in a project. */
export interface CommandRunState {
  running: boolean
  startedAt?: number
  exitCode?: number | null
  /** bounded output backlog, so a (re)attaching window can rebuild the log */
  log: string
}

/** Streamed over `command:event` while a studio command runs. */
export type CommandEvent =
  | { kind: 'command-started'; projectId: string; commandId: string }
  | { kind: 'command-output'; projectId: string; commandId: string; chunk: string }
  | { kind: 'command-exited'; projectId: string; commandId: string; code: number | null }

/** A named conversation with the agent, scoped to one project. */
export interface AgentThread {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  /** number of chat items in the thread */
  messageCount: number
  /** 'workshop' threads design the studio itself (edit fabulist.json, skills, CLAUDE.md) */
  kind?: 'workshop'
}

export interface ChatItem {
  id: string
  role: 'user' | 'assistant'
  text: string
  quote?: string
  /** file names the user attached to this message */
  attachments?: string[]
  at: number
  /** tool activity lines shown under an assistant item */
  toolNotes?: { toolId: string; note: string; done?: boolean; ok?: boolean }[]
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

export interface Attachment {
  /** absolute path to the file on disk */
  path: string
  /** file name (basename), shown in the UI */
  name: string
}

export interface SendOptions {
  /** The doc the author is focused on / that a quote or comment belongs to */
  docFile?: string
  /** When set, Claude's final reply is also appended to this comment thread */
  commentId?: string
  /** Selected text the user is asking about */
  quote?: string
  /** Files the user attached: images/PDFs are sent inline, others copied into the doc folder */
  attachments?: Attachment[]
}
