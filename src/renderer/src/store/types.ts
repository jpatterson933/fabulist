import type {
  AgentEvent,
  ChatItem,
  CommentAnchor,
  CommentThread,
  CommitInfo,
  DocMeta,
  ModelChoice,
  PermissionRequest
} from '@shared/types'

export type SidebarTab = 'chat' | 'comments' | 'history'

export interface DraftComment {
  anchor: CommentAnchor
}

export interface AgentState {
  status: 'idle' | 'starting' | 'working' | 'done' | 'error'
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

/** Comment threads, the in-progress draft, and re-anchoring through edits. */
export interface CommentsSlice {
  threads: CommentThread[]
  draftComment: DraftComment | null
  activeThreadId: string | null
  scrollTo: { threadId: string; seq: number } | null
  /** comment prompts waiting for the agent to free up */
  queuedCommentSends: { commentId: string; prompt: string; quote: string }[]

  reloadThreads: () => Promise<void>
  persistAnchors: (anchors: { id: string; from: number; to: number }[]) => void
  startDraftComment: (anchor: CommentAnchor) => void
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
  /** opt-in scroll request to a document offset (e.g. "Show in document" on an edit card) */
  revealPos: { pos: number; seq: number } | null

  askClaude: (prompt: string, opts?: { quote?: string; commentId?: string }) => Promise<void>
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
}

/** Git history list and version preview/restore. */
export interface HistorySlice {
  commits: CommitInfo[]
  preview: { hash: string; content: string; subject: string } | null

  loadHistory: () => Promise<void>
  openPreview: (commit: CommitInfo) => Promise<void>
  closePreview: () => void
  restorePreview: () => Promise<void>
}

export type Store = DocSlice &
  CommentsSlice &
  ChatSlice &
  PermissionsSlice &
  SettingsSlice &
  HistorySlice
