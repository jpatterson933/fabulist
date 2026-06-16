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

/** One thread's re-anchored position, persisted in a batch after editor edits. */
export interface AnchorUpdate {
  id: string
  anchor: CommentAnchor
  status?: CommentThread['status']
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
  /** What kind of approval this is, derived from the tool registry — lets the UI pick one card variant */
  kind?: 'edit' | 'command' | 'question'
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

/** Token + cost usage for one agent run, read off the SDK result message. */
export interface RunUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  costUsd?: number
  numTurns?: number
  /** The model the run actually resolved to (full SDK id), captured off the stream. */
  model?: string
}

/** Lifecycle state of an agent run, shared by the wire event and the store. */
export type AgentStatus = 'idle' | 'starting' | 'working' | 'done' | 'error'

export type AgentEvent =
  | { kind: 'status'; docId: string; status: AgentStatus; detail?: string }
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
      usage?: RunUsage
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
  /** a token/cost usage line for a finished run (Plugin Studio test/authoring) */
  usage?: RunUsage
  streaming?: boolean
  error?: string
}

/**
 * How many archived test runs we keep per skill. Oldest are dropped past this; the
 * studio surfaces a note in the archived-run picker once the cap is reached so it's
 * clear older runs aren't retained. Single source of truth for main + renderer.
 */
export const MAX_ARCHIVED_TESTS = 10

/** A test thread archived when the user started a new one — read-only history, versioned. */
export interface ArchivedTest {
  /** odometer version label, e.g. "0.0.1" (see shared/testVersion.ts) */
  version: string
  at: number
  chat: ChatItem[]
}

/**
 * How a studio chat message is shown vs. what the model receives. `echo` is the text
 * the chat bubble displays (the user's note); `quote` is an optional short marker (e.g.
 * "Using the X skill" / "Referenced test v0.0.1"). The full prompt — which may carry a
 * woven-in transcript or invocation directive — is sent separately to the model.
 */
export interface DisplayOptions {
  echo: string
  quote?: string
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

/** A skill being authored in the Plugin Studio — read from its SKILL.md frontmatter. */
export interface StudioSkill {
  /** folder name under the studio plugin's skills/ dir */
  slug: string
  name: string
  description: string
}

/** One file or directory inside a studio skill's folder (posix-relative path). */
export interface StudioFile {
  rel: string
  isDir: boolean
}

/**
 * Per-skill Studio settings — the studio analogue of DocSettings. Persisted under
 * .skill-studio/.state/<slug>.json and read by the main process when it launches the
 * authoring or test agent, so the choice survives a restart exactly like the document
 * app's per-document model + auto-apply.
 */
export interface StudioSettings {
  /** Claude Code model alias/id used for both authoring + test runs; '' = CLI default */
  model: string
  /** apply the authoring agent's edits without an approval card */
  autoApprove: boolean
}

export type StudioSettingKey = keyof StudioSettings

export interface SendOptions {
  /** When set, Claude's final reply is also appended to this comment thread */
  commentId?: string
  /** Selected text the user is asking about */
  quote?: string
}
