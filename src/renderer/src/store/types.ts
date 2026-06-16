import type {
  AgentEvent,
  AgentStatus,
  ArchivedTest,
  ChatItem,
  CommentAnchor,
  CommentThread,
  CommitInfo,
  DocMeta,
  ModelChoice,
  PermissionRequest,
  StudioFile,
  StudioSkill
} from '@shared/types'
import type { DocSettings } from '@shared/settings'

export type SidebarTab = 'chat' | 'comments' | 'history'

/** Which top-level workspace is showing — the writing studio or the Skill Studio. */
export type AppMode = 'doc' | 'skillStudio'

/** Which Skill Studio sidebar tab is showing. */
export type StudioTab = 'chat' | 'comments' | 'test'

/** A note anchored to a quoted passage of a skill file (in-memory for now). */
export interface StudioComment {
  id: string
  /** the skill file the quote came from, relative to the plugin folder */
  file: string
  quote: string
  note: string
  at: number
}

/** An in-progress comment: the captured selection, before a note is written. */
export interface StudioDraftComment {
  file: string
  quote: string
}

/** Running token/cost totals across a skill's runs (test or authoring) this session. */
export interface UsageTotals {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  costUsd: number
  runs: number
}

export interface DraftComment {
  anchor: CommentAnchor
  /** in-progress text, kept in the store so it survives tab switches and sidebar toggles */
  text: string
}

export interface AgentState {
  status: AgentStatus
  detail?: string
}

export interface ExternalUpdate {
  seq: number
  content: string
}

/** Open document, its content, the library/layout chrome, and doc lifecycle. */
export interface DocSlice {
  docs: DocMeta[]
  activeId: string | null
  content: string
  external: ExternalUpdate | null
  tab: SidebarTab
  sidebarOpen: boolean
  libraryOpen: boolean

  loadDocs: () => Promise<void>
  createDoc: (title: string) => Promise<void>
  /** Duplicate a document's current text into a fresh document, then open it. */
  cloneDoc: (id: string) => Promise<void>
  deleteDoc: (id: string) => Promise<void>
  openDoc: (id: string) => Promise<void>
  closeDoc: () => Promise<void>

  setContent: (content: string) => void
  flushWrite: () => Promise<void>
  snapshot: (label?: string) => Promise<void>

  setTab: (tab: SidebarTab) => void
  toggleSidebar: () => void
  toggleLibrary: () => void

  handleExternalChange: (id: string, content: string) => void
}

/** Renderer error reporting — the one place that decides how a reported error surfaces. */
export interface ErrorsSlice {
  /** Last surfaced error (e.g. a failed manuscript save), shown as a dismissible banner. */
  lastError: string | null
  /** Report an error from anywhere: formats, logs (→ terminal), and shows the banner. */
  reportError: (e: unknown, context?: string) => void
  /** Clear the error banner. */
  dismissError: () => void
}

/** Comment threads, the in-progress draft, and re-anchoring through edits. */
export interface CommentsSlice {
  threads: CommentThread[]
  draftComment: DraftComment | null
  activeThreadId: string | null
  scrollTo: { threadId: string; seq: number } | null
  /** comment prompts waiting for the agent to free up */
  queuedCommentSends: { commentId: string; prompt: string; quote: string }[]

  reloadThreads: () => Promise<void>
  /** Clear the in-progress draft / active thread / queue (on opening a document). */
  clearCommentDrafts: () => void
  /** Clear all comment state including loaded threads (on closing a document). */
  resetComments: () => void
  /** Send the next queued comment to the agent, if any (called when a run finishes). */
  sendNextQueuedComment: () => void
  persistAnchors: (anchors: { id: string; from: number; to: number }[]) => void
  startDraftComment: (anchor: CommentAnchor) => void
  /** Update the in-progress draft text (persisted in the store across tab switches). */
  setDraftCommentText: (text: string) => void
  cancelDraftComment: () => void
  submitDraftComment: (text: string) => Promise<void>
  replyToThread: (threadId: string, text: string) => Promise<void>
  resolveThread: (threadId: string, status: CommentThread['status']) => Promise<void>
  removeThread: (threadId: string) => Promise<void>
  setActiveThread: (threadId: string | null) => void
  jumpToThread: (threadId: string) => void
  /** send a comment thread to Claude now, or queue it if the agent is busy */
  engageClaudeOnThread: (thread: CommentThread) => void
}

/** The chat transcript, agent run status, and the agent event reducer. */
export interface ChatSlice {
  chats: Record<string, ChatItem[]>
  agent: Record<string, AgentState>
  /** thread Claude is currently replying to */
  pendingCommentId: string | null
  /** opt-in request to scroll to + transiently highlight an edited span (e.g. "Show in document") */
  revealPos: { from: number; to: number; seq: number } | null

  askClaude: (prompt: string, opts?: { quote?: string; commentId?: string }) => Promise<void>
  /** Load the persisted transcript for a document into the chat map. */
  loadChat: (id: string) => Promise<void>
  /** Clear per-run chat state (the comment thread being replied to). */
  resetChatRun: () => void
  interrupt: () => void
  /** scroll the editor to where an applied edit landed (best-effort, by quote) */
  revealEdit: (edit: NonNullable<ChatItem['edit']>) => void
  handleAgentEvent: (e: AgentEvent) => void
}

/** Pending permission requests and the one rendered inline in the document. */
export interface PermissionsSlice {
  permissions: PermissionRequest[]
  /** requestId of a permission currently rendered as an in-document suggestion */
  inlineSuggestionId: string | null

  respondPermission: (
    requestId: string,
    approved: boolean,
    answers?: Record<string, string>
  ) => void
  setInlineSuggestion: (requestId: string | null) => void
  /** Append a pending request (deduped by the caller). Owned here, not written by other slices. */
  addPermission: (request: PermissionRequest) => void
  /** Drop a resolved request by id. */
  removePermission: (requestId: string) => void
  /** Clear all pending requests and the inline suggestion (on opening a document). */
  resetPermissions: () => void
}

/** Per-document preferences: model, font, and auto-apply. */
export interface SettingsSlice {
  model: string
  models: ModelChoice[]
  /** apply Claude's file edits without asking (per document) */
  autoApprove: boolean
  font: string

  setModel: (model: string) => void
  setAutoApprove: (on: boolean) => void
  loadModels: () => Promise<void>
  setFont: (font: string) => void
  /** Distribute a freshly-loaded settings bundle into the slice. */
  applySettings: (settings: DocSettings) => void
  /** Fetch and apply this document's settings (used by openDoc). */
  loadSettings: (id: string) => Promise<void>
}

/** Git history list and version preview/restore. */
export interface HistorySlice {
  commits: CommitInfo[]
  preview: { hash: string; content: string; subject: string } | null

  loadHistory: () => Promise<void>
  openPreview: (commit: CommitInfo) => Promise<void>
  closePreview: () => void
  restorePreview: () => Promise<void>
  /** Clear history list and any open preview (on closing a document). */
  resetHistory: () => void
}

/**
 * Skill Studio — a self-contained second workspace for authoring skills (as a real
 * Claude plugin) and testing them in a jailed sandbox. Owns the top-level `mode`
 * switch and all of its own state; nothing else in the store reads these fields.
 */
export interface SkillStudioSlice {
  mode: AppMode
  /** left skill rail open (collapsible, mirrors the library rail) */
  studioRailOpen: boolean
  /** width (px) of the right sidebar (chat/comments/test) — resizable wider than the default */
  studioSidebarWidth: number
  /** which sidebar tab (chat / comments / test) is showing */
  studioTab: StudioTab
  /** skills in the studio (each is its own plugin) */
  studioSkills: StudioSkill[]
  /** slug of the skill currently being edited */
  activeSkill: string | null
  /** files + dirs inside the active skill's folder */
  studioFiles: StudioFile[]
  /** the file open in the editor, relative to the active skill's folder */
  openFilePath: string | null
  /** editor buffer for openFilePath */
  fileContent: string
  fileDirty: boolean
  /** authoring-chat transcript + run status, keyed by skill slug */
  authChats: Record<string, ChatItem[]>
  authAgent: Record<string, AgentStatus>
  /** comments per skill (in-memory) + the in-progress draft */
  comments: Record<string, StudioComment[]>
  studioDraft: StudioDraftComment | null
  /** test-thread transcript + run status, keyed by skill slug */
  testChats: Record<string, ChatItem[]>
  testAgent: Record<string, AgentStatus>
  /** cumulative token/cost totals per skill — authoring and test runs (client tracks this) */
  authUsage: Record<string, UsageTotals>
  testUsage: Record<string, UsageTotals>
  /** apply the authoring agent's file edits without an approval card (mirrors the doc app) */
  studioAutoApprove: boolean
  /** model for the active skill's authoring + test runs ('' = CLI default); persisted per-skill */
  studioModel: string
  /** pending approval/question requests for the authoring chat, keyed by skill slug */
  authPermissions: Record<string, PermissionRequest[]>
  /** pending question requests during a test run, keyed by skill slug */
  testPermissions: Record<string, PermissionRequest[]>
  /** version index of the CURRENT live test, keyed by skill slug (1 = the first) */
  testVersion: Record<string, number>
  /** archived test runs (most-recent-first), read-only, keyed by skill slug */
  archivedTests: Record<string, ArchivedTest[]>
  /** opt-in request to scroll to + transiently highlight an applied edit in the file editor */
  studioRevealPos: { from: number; to: number; seq: number } | null

  openStudio: () => Promise<void>
  closeStudio: () => void
  toggleStudioRail: () => void
  /** set the sidebar width (clamped between the default and a sane max) */
  setStudioSidebarWidth: (w: number) => void
  setStudioTab: (tab: StudioTab) => void
  loadStudioSkills: () => Promise<void>
  createStudioSkill: (name: string) => Promise<void>
  deleteStudioSkill: (slug: string) => Promise<void>
  openStudioSkill: (slug: string) => Promise<void>
  loadStudioFiles: (slug: string) => Promise<void>
  openStudioFile: (rel: string) => Promise<void>
  setFileContent: (text: string) => void
  flushStudioFile: () => Promise<void>
  addStudioFile: (rel: string) => Promise<void>
  addStudioFolder: (rel: string) => Promise<void>
  removeStudioFile: (rel: string) => Promise<void>
  /**
   * Authoring chat: ask Claude to build/refine the skill (it edits the skill's files).
   * With `{ testRef: true }`, the current test thread's transcript is woven into the
   * prompt as context, so you can say "the test did X, fix it" and Claude can see the run.
   */
  authSend: (
    prompt: string,
    opts?: { testRef?: 'current' | { version: string } }
  ) => Promise<void>
  interruptAuth: () => void
  /** start a fresh authoring conversation — wipes the transcript + SDK session, keeps the skill's files */
  resetAuth: () => Promise<void>
  handleAuthEvent: (e: AgentEvent) => void
  /** toggle whether the authoring agent's edits auto-apply or wait for approval */
  setStudioAutoApprove: (on: boolean) => void
  /** set the active skill's model (persisted per-skill; used for authoring + test runs) */
  setStudioModel: (model: string) => void
  /** answer a studio approval/question card (test or authoring) */
  respondStudioPermission: (
    requestId: string,
    approved: boolean,
    answers?: Record<string, string>
  ) => void
  /** open the edited file and scroll to + briefly highlight where an applied edit landed */
  revealStudioEdit: (edit: NonNullable<ChatItem['edit']>) => Promise<void>
  /** commenting: capture a selection, write a note, send it into the authoring chat */
  startComment: (file: string, quote: string) => void
  cancelComment: () => void
  submitComment: (note: string) => Promise<void>
  removeComment: (id: string) => void
  /**
   * Run the skill against a task. With `{ skill }`, the prompt the model receives is
   * prefixed with a "Use the <name> skill" directive (mirroring an explicit invocation),
   * while the chat shows the task plus a short marker.
   */
  testSkill: (prompt: string, opts?: { skill?: string }) => Promise<void>
  /** clear the live test thread to a fresh one (no archive) — used for an empty thread */
  resetTest: () => Promise<void>
  /** archive the current test under its version, bump the version, open a fresh thread */
  archiveAndResetTest: () => Promise<void>
  interruptTest: () => void
  handleStudioEvent: (e: AgentEvent) => void
}

export type Store = DocSlice &
  CommentsSlice &
  ChatSlice &
  PermissionsSlice &
  SettingsSlice &
  HistorySlice &
  ErrorsSlice &
  SkillStudioSlice
