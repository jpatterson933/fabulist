import { create } from 'zustand'
import {
  DEFAULT_FONT,
  DEFAULT_MODEL_CHOICE,
  FALLBACK_MODEL_CHOICES,
  type AgentEvent,
  type AgentThread,
  type Attachment,
  type ChatItem,
  type CommentAnchor,
  type CommentThread,
  type CommitInfo,
  type DocMeta,
  type ModelChoice,
  type PermissionRequest,
  type ProjectMeta
} from '@shared/types'
import type { ActionDef, Harness } from '@shared/harness'
import { locateAnchor } from './lib/anchors'

export type SidebarTab = 'chat' | 'comments' | 'history'

export interface DraftComment {
  anchor: CommentAnchor
}

export interface AgentState {
  status: 'idle' | 'starting' | 'working' | 'done' | 'error'
  detail?: string
}

interface ExternalUpdate {
  seq: number
  content: string
}

interface FabulistStore {
  projects: ProjectMeta[]
  activeProjectId: string | null
  /** docs of the active project */
  docs: DocMeta[]
  /** open tab filenames for the active project */
  openDocs: string[]
  /** active tab filename */
  activeDoc: string | null
  /** cached content of open tabs, keyed by doc filename */
  docContents: Record<string, string>
  /** the active doc's live content (the editor binds to this) */
  content: string
  external: ExternalUpdate | null
  /** comment threads for the active doc */
  threads: CommentThread[]
  /** chat transcripts keyed by agent thread id */
  chats: Record<string, ChatItem[]>
  /** agent conversation list keyed by project id */
  agentThreads: Record<string, AgentThread[]>
  /** active agent thread id keyed by project id */
  activeThread: Record<string, string>
  permissions: PermissionRequest[]
  /** agent status keyed by project id */
  agent: Record<string, AgentState>
  tab: SidebarTab
  /** what the left rail shows: the project list, or the active project's docs */
  railView: 'projects' | 'docs'
  sidebarOpen: boolean
  libraryOpen: boolean
  commits: CommitInfo[]
  preview: { hash: string; content: string; subject: string } | null
  model: string
  models: ModelChoice[]
  font: string
  draftComment: DraftComment | null
  activeThreadId: string | null
  inlineSuggestionId: string | null
  pendingCommentId: string | null
  queuedCommentSends: { commentId: string; prompt: string; quote: string }[]
  scrollTo: { threadId: string; seq: number } | null
  autoApprove: boolean
  /** the active project's studio harness (fabulist.json + skills), if loaded */
  harness: Harness | null
  /** harness panels open as tabs, like documents; ids into harness.config.panels */
  openPanels: string[]
  /** the focused panel tab; when set it shows instead of the active doc */
  activePanel: string | null
  paletteOpen: boolean
  /** the new-document dialog (title + doc type) */
  newDocOpen: boolean
  /** current editor selection, for selection-surface actions */
  selectionQuote: string | null

  loadHarness: () => Promise<void>
  trustStudio: (trusted: boolean) => Promise<void>
  /** quote overrides the tracked editor selection (used by the selection toolbar) */
  runAction: (action: ActionDef, quote?: string) => void
  openPanel: (panelId: string) => void
  closePanel: (panelId: string) => void
  setPaletteOpen: (open: boolean) => void
  setNewDocOpen: (open: boolean) => void
  setSelectionQuote: (quote: string | null) => void
  openWorkshop: () => Promise<void>

  loadProjects: () => Promise<void>
  createProject: (title: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  openProject: (id: string) => Promise<void>
  closeProject: () => Promise<void>

  loadDocs: () => Promise<void>
  createDoc: (title: string, typeId?: string) => Promise<void>
  deleteDoc: (docFile: string) => Promise<void>
  openTab: (docFile: string) => Promise<void>
  closeTab: (docFile: string) => Promise<void>
  setActiveDoc: (docFile: string) => Promise<void>

  setContent: (content: string) => void
  flushWrite: () => Promise<void>
  snapshot: (label?: string) => Promise<void>

  setTab: (tab: SidebarTab) => void
  setRailView: (view: 'projects' | 'docs') => void
  toggleSidebar: () => void
  toggleLibrary: () => void

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

  loadAgentThreads: () => Promise<void>
  createAgentThread: () => Promise<void>
  selectAgentThread: (threadId: string) => Promise<void>
  renameAgentThread: (threadId: string, title: string) => Promise<void>
  deleteAgentThread: (threadId: string) => Promise<void>

  askClaude: (
    prompt: string,
    opts?: { quote?: string; commentId?: string; attachments?: Attachment[] }
  ) => void
  engageClaudeOnThread: (thread: CommentThread) => void
  setModel: (model: string) => void
  loadModels: () => Promise<void>
  setFont: (font: string) => void
  interrupt: () => void
  respondPermission: (requestId: string, approved: boolean) => void
  setInlineSuggestion: (requestId: string | null) => void
  setAutoApprove: (on: boolean) => void

  loadHistory: () => Promise<void>
  openPreview: (commit: CommitInfo) => Promise<void>
  closePreview: () => void
  restorePreview: () => Promise<void>

  handleAgentEvent: (e: AgentEvent) => void
  handleExternalChange: (projectId: string, docFile: string, content: string) => void
}

// per-(project,doc) debounce timers, so a tab switch flushes the right file
let writeTimer: ReturnType<typeof setTimeout> | null = null
let writeTarget: { projectId: string; docFile: string } | null = null
let idleCommitTimer: ReturnType<typeof setTimeout> | null = null
let anchorTimer: ReturnType<typeof setTimeout> | null = null
let extSeq = 1

// panel tabs persist alongside doc tabs in project.json's openTabs, prefixed
// so a plain filename can never collide with a panel id
const PANEL_TAB = 'panel:'
const combinedTabs = (openDocs: string[], openPanels: string[]): string[] => [
  ...openDocs,
  ...openPanels.map((id) => PANEL_TAB + id)
]

/** Re-anchor stored threads against current content; returns updated copies. */
function reanchor(threads: CommentThread[], content: string): CommentThread[] {
  return threads.map((t) => {
    if (t.status === 'resolved') return t
    const loc = locateAnchor(content, t.anchor)
    if (!loc) return { ...t, status: 'orphaned' as const }
    return {
      ...t,
      status: t.status === 'orphaned' ? ('open' as const) : t.status,
      anchor: { ...t.anchor, from: loc.from, to: loc.to }
    }
  })
}

export const useStore = create<FabulistStore>((set, get) => ({
  projects: [],
  activeProjectId: null,
  docs: [],
  openDocs: [],
  activeDoc: null,
  docContents: {},
  content: '',
  external: null,
  threads: [],
  chats: {},
  agentThreads: {},
  activeThread: {},
  permissions: [],
  agent: {},
  tab: 'chat',
  railView: 'projects',
  sidebarOpen: true,
  libraryOpen: true,
  commits: [],
  preview: null,
  model: '',
  models: FALLBACK_MODEL_CHOICES,
  font: DEFAULT_FONT,
  draftComment: null,
  activeThreadId: null,
  inlineSuggestionId: null,
  pendingCommentId: null,
  queuedCommentSends: [],
  scrollTo: null,
  autoApprove: localStorage.getItem('fabulist:autoApprove') === '1',
  harness: null,
  openPanels: [],
  activePanel: null,
  paletteOpen: false,
  newDocOpen: false,
  selectionQuote: null,

  loadHarness: async () => {
    const id = get().activeProjectId
    if (!id) return
    const harness = await window.fabulist.harness.load(id)
    // drop tabs for panels whose definition disappeared out from under us
    const openPanels = get().openPanels.filter((p) => harness.config.panels.some((x) => x.id === p))
    const activePanel =
      get().activePanel && openPanels.includes(get().activePanel!) ? get().activePanel : null
    set({ harness, openPanels, activePanel })
  },

  trustStudio: async (trusted) => {
    const id = get().activeProjectId
    if (!id) return
    await window.fabulist.harness.setTrusted(id, trusted)
    await get().loadHarness()
  },

  runAction: (action, quoteOverride) => {
    const quote = action.surface === 'selection' ? quoteOverride ?? get().selectionQuote : null
    if (action.surface === 'selection' && !quote) return
    const parts: string[] = []
    if (action.skill) {
      parts.push(`Invoke your "${action.skill}" skill (use the Skill tool) and follow it.`)
    }
    if (action.prompt) parts.push(action.prompt)
    if (action.surface === 'doc' && !action.prompt && !action.skill) return
    if (action.surface === 'doc') {
      parts.push('Apply this to the document the author is currently focused on.')
    }
    set({ paletteOpen: false })
    get().askClaude(parts.join('\n\n'), quote ? { quote } : {})
  },

  openPanel: (panelId) => {
    const id = get().activeProjectId
    if (!id || !get().harness?.config.panels.some((p) => p.id === panelId)) return
    const openPanels = get().openPanels.includes(panelId)
      ? get().openPanels
      : [...get().openPanels, panelId]
    set({ openPanels, activePanel: panelId })
    void window.fabulist.project.setOpenTabs(id, combinedTabs(get().openDocs, openPanels))
  },

  closePanel: (panelId) => {
    const id = get().activeProjectId
    if (!id) return
    const openPanels = get().openPanels.filter((p) => p !== panelId)
    // closing the focused panel falls back to the remaining tabs: last panel, else the active doc
    const activePanel =
      get().activePanel === panelId ? openPanels[openPanels.length - 1] ?? null : get().activePanel
    set({ openPanels, activePanel })
    void window.fabulist.project.setOpenTabs(id, combinedTabs(get().openDocs, openPanels))
  },

  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setNewDocOpen: (open) => set({ newDocOpen: open }),
  setSelectionQuote: (quote) => {
    if (get().selectionQuote !== quote) set({ selectionQuote: quote })
  },

  openWorkshop: async () => {
    const id = get().activeProjectId
    if (!id) return
    const existing = (get().agentThreads[id] ?? []).find((t) => t.kind === 'workshop')
    if (existing) {
      await get().selectAgentThread(existing.id)
      set({ tab: 'chat', sidebarOpen: true })
      return
    }
    const thread = await window.fabulist.agent.createThread(id, 'Studio workshop', 'workshop')
    set({
      agentThreads: { ...get().agentThreads, [id]: [...(get().agentThreads[id] ?? []), thread] },
      activeThread: { ...get().activeThread, [id]: thread.id },
      chats: { ...get().chats, [thread.id]: [] },
      tab: 'chat',
      sidebarOpen: true
    })
  },

  loadProjects: async () => {
    set({ projects: await window.fabulist.library.projects() })
  },

  createProject: async (title) => {
    const meta = await window.fabulist.library.createProject(title)
    await get().loadProjects()
    await get().openProject(meta.id)
  },

  deleteProject: async (id) => {
    if (get().activeProjectId === id) await get().closeProject()
    await window.fabulist.library.deleteProject(id)
    await get().loadProjects()
  },

  openProject: async (id) => {
    const prev = get().activeProjectId
    if (prev && prev !== id) await get().closeProject()

    const [docs, meta, agentThreads, activeThreadId, commits, model, harness] = await Promise.all([
      window.fabulist.project.docs(id),
      window.fabulist.project.meta(id),
      window.fabulist.agent.threads(id),
      window.fabulist.agent.activeThread(id),
      window.fabulist.history.log(id),
      window.fabulist.project.getModel(id),
      window.fabulist.harness.load(id)
    ])

    const present = new Set(docs.map((d) => d.file))
    let openDocs = meta.openTabs.filter((f) => !f.startsWith(PANEL_TAB) && present.has(f))
    const openPanels = meta.openTabs
      .filter((f) => f.startsWith(PANEL_TAB))
      .map((f) => f.slice(PANEL_TAB.length))
      .filter((p) => harness.config.panels.some((x) => x.id === p))
    if (openDocs.length === 0 && docs.length > 0) openDocs = [docs[0].file]
    const activeDoc =
      meta.activeDoc && openDocs.includes(meta.activeDoc)
        ? meta.activeDoc
        : openDocs[0] ?? null

    let content = ''
    let threads: CommentThread[] = []
    let font = DEFAULT_FONT
    if (activeDoc) {
      const [c, rawThreads, f] = await Promise.all([
        window.fabulist.doc.read(id, activeDoc),
        window.fabulist.comments.list(id, activeDoc),
        window.fabulist.doc.getFont(id, activeDoc)
      ])
      content = c
      threads = reanchor(rawThreads, c)
      font = f || DEFAULT_FONT
    }
    const chat = activeThreadId ? await window.fabulist.agent.threadChat(id, activeThreadId) : []

    set({
      activeProjectId: id,
      railView: 'docs',
      docs,
      openDocs,
      activeDoc,
      docContents: activeDoc ? { [activeDoc]: content } : {},
      content,
      external: { seq: extSeq++, content },
      threads,
      commits,
      model,
      font,
      preview: null,
      draftComment: null,
      activeThreadId: null,
      permissions: [],
      inlineSuggestionId: null,
      pendingCommentId: null,
      queuedCommentSends: [],
      harness,
      openPanels,
      activePanel: null,
      paletteOpen: false,
      newDocOpen: false,
      selectionQuote: null,
      agentThreads: { ...get().agentThreads, [id]: agentThreads },
      activeThread: { ...get().activeThread, [id]: activeThreadId },
      chats: { ...get().chats, [activeThreadId]: chat ?? [] }
    })
    // watching also re-emits any permission requests pending for this project
    await window.fabulist.project.watch(id)
  },

  closeProject: async () => {
    const id = get().activeProjectId
    if (!id) return
    await get().flushWrite()
    await window.fabulist.doc.snapshot(id, 'Edited').catch(() => {})
    await window.fabulist.project.watch(null)
    set({
      activeProjectId: null,
      railView: 'projects',
      docs: [],
      openDocs: [],
      activeDoc: null,
      docContents: {},
      content: '',
      threads: [],
      commits: [],
      preview: null,
      harness: null,
      openPanels: [],
      activePanel: null,
      paletteOpen: false,
      newDocOpen: false,
      selectionQuote: null
    })
  },

  loadDocs: async () => {
    const id = get().activeProjectId
    if (!id) return
    set({ docs: await window.fabulist.project.docs(id) })
  },

  createDoc: async (title, typeId) => {
    const id = get().activeProjectId
    if (!id) return
    const meta = await window.fabulist.project.createDoc(id, title, typeId)
    await get().loadDocs()
    // add the tab but let setActiveDoc read the seeded file from disk (which also
    // primes the watcher's echo-suppression so the create write doesn't bounce back)
    set({ openDocs: [...get().openDocs.filter((f) => f !== meta.file), meta.file] })
    await get().setActiveDoc(meta.file)
    await get().loadProjects()
  },

  deleteDoc: async (docFile) => {
    const id = get().activeProjectId
    if (!id) return
    await window.fabulist.project.deleteDoc(id, docFile)
    const openDocs = get().openDocs.filter((f) => f !== docFile)
    const { [docFile]: _gone, ...docContents } = get().docContents
    set({ openDocs, docContents })
    if (get().activeDoc === docFile) {
      const next = openDocs[openDocs.length - 1] ?? null
      if (next) await get().setActiveDoc(next)
      else set({ activeDoc: null, content: '', threads: [], external: { seq: extSeq++, content: '' } })
    }
    await get().loadDocs()
    await get().loadProjects()
  },

  openTab: async (docFile) => {
    if (!get().openDocs.includes(docFile)) {
      const openDocs = [...get().openDocs, docFile]
      set({ openDocs })
      const id = get().activeProjectId
      if (id) void window.fabulist.project.setOpenTabs(id, combinedTabs(openDocs, get().openPanels))
    }
    await get().setActiveDoc(docFile)
  },

  closeTab: async (docFile) => {
    const id = get().activeProjectId
    if (!id) return
    // flush the file being closed if it's the live one
    if (get().activeDoc === docFile) await get().flushWrite()
    const openDocs = get().openDocs.filter((f) => f !== docFile)
    const { [docFile]: _gone, ...docContents } = get().docContents
    set({ openDocs, docContents })
    void window.fabulist.project.setOpenTabs(id, combinedTabs(openDocs, get().openPanels))
    if (get().activeDoc === docFile) {
      const next = openDocs[openDocs.length - 1] ?? null
      if (next) await get().setActiveDoc(next)
      else {
        set({ activeDoc: null, content: '', threads: [], external: { seq: extSeq++, content: '' } })
        void window.fabulist.project.setActiveDoc(id, null)
      }
    }
  },

  setActiveDoc: async (docFile) => {
    const id = get().activeProjectId
    // selecting a doc always leaves any open harness panel
    if (get().activePanel) set({ activePanel: null })
    if (!id || get().activeDoc === docFile) return
    // stash the outgoing doc's live content and flush its pending write
    const prevDoc = get().activeDoc
    if (prevDoc) {
      set({ docContents: { ...get().docContents, [prevDoc]: get().content } })
      await get().flushWrite()
    }
    const cached = get().docContents[docFile]
    const content = cached ?? (await window.fabulist.doc.read(id, docFile))
    const [rawThreads, font] = await Promise.all([
      window.fabulist.comments.list(id, docFile),
      window.fabulist.doc.getFont(id, docFile)
    ])
    set({
      activeDoc: docFile,
      content,
      docContents: { ...get().docContents, [docFile]: content },
      external: { seq: extSeq++, content },
      threads: reanchor(rawThreads, content),
      font: font || DEFAULT_FONT,
      preview: null,
      draftComment: null,
      activeThreadId: null,
      inlineSuggestionId: null
    })
    void window.fabulist.project.setActiveDoc(id, docFile)
  },

  setContent: (content) => {
    const id = get().activeProjectId
    const docFile = get().activeDoc
    if (!id || !docFile) return
    set({ content, docContents: { ...get().docContents, [docFile]: content } })
    writeTarget = { projectId: id, docFile }
    if (writeTimer) clearTimeout(writeTimer)
    writeTimer = setTimeout(async () => {
      writeTimer = null
      await window.fabulist.doc.write(id, docFile, get().content).catch(() => {})
      get().loadDocs()
      get().loadProjects()
    }, 400)
    if (idleCommitTimer) clearTimeout(idleCommitTimer)
    idleCommitTimer = setTimeout(async () => {
      idleCommitTimer = null
      if (get().activeProjectId !== id) return
      await get().flushWrite()
      const committed = await window.fabulist.doc.snapshot(id, 'Edited').catch(() => false)
      if (committed) get().loadHistory()
    }, 60_000)
  },

  flushWrite: async () => {
    if (!writeTimer || !writeTarget) return
    const { projectId, docFile } = writeTarget
    clearTimeout(writeTimer)
    writeTimer = null
    const content = get().docContents[docFile] ?? get().content
    await window.fabulist.doc.write(projectId, docFile, content).catch(() => {})
    get().loadDocs()
    get().loadProjects()
  },

  snapshot: async (label) => {
    const id = get().activeProjectId
    if (!id) return
    await get().flushWrite()
    await window.fabulist.doc.snapshot(id, label)
    await get().loadHistory()
  },

  setTab: (tab) => set({ tab, sidebarOpen: true }),
  setRailView: (railView) => set({ railView }),
  toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
  toggleLibrary: () => set({ libraryOpen: !get().libraryOpen }),

  reloadThreads: async () => {
    const id = get().activeProjectId
    const docFile = get().activeDoc
    if (!id || !docFile) return
    const raw = await window.fabulist.comments.list(id, docFile)
    set({ threads: reanchor(raw, get().content) })
  },

  persistAnchors: (anchors) => {
    const id = get().activeProjectId
    const docFile = get().activeDoc
    if (!id || !docFile) return
    const content = get().content
    const threads = get().threads.map((t) => {
      const a = anchors.find((x) => x.id === t.id)
      if (!a) return t
      const text = content.slice(a.from, a.to)
      return {
        ...t,
        anchor: {
          text: text || t.anchor.text,
          prefix: content.slice(Math.max(0, a.from - 32), a.from),
          suffix: content.slice(a.to, a.to + 32),
          from: a.from,
          to: a.to
        }
      }
    })
    set({ threads })
    if (anchorTimer) clearTimeout(anchorTimer)
    anchorTimer = setTimeout(() => {
      anchorTimer = null
      window.fabulist.comments
        .updateAnchors(
          id,
          docFile,
          threads
            .filter((t) => t.status !== 'resolved')
            .map((t) => ({ id: t.id, anchor: t.anchor, status: t.status }))
        )
        .catch(() => {})
    }, 800)
  },

  startDraftComment: (anchor) => set({ draftComment: { anchor }, tab: 'comments', sidebarOpen: true }),
  cancelDraftComment: () => set({ draftComment: null }),

  submitDraftComment: async (text) => {
    const id = get().activeProjectId
    const docFile = get().activeDoc
    const draft = get().draftComment
    if (!id || !docFile || !draft || !text.trim()) return
    const thread = await window.fabulist.comments.add(id, docFile, draft.anchor, text.trim())
    set({ draftComment: null, activeThreadId: thread.id })
    await get().reloadThreads()
    get().engageClaudeOnThread(thread)
  },

  replyToThread: async (threadId, text) => {
    const id = get().activeProjectId
    const docFile = get().activeDoc
    if (!id || !docFile || !text.trim()) return
    const thread = await window.fabulist.comments.reply(id, docFile, threadId, text.trim())
    await get().reloadThreads()
    if (thread) get().engageClaudeOnThread(thread)
  },

  engageClaudeOnThread: (thread) => {
    const id = get().activeProjectId
    if (!id) return
    const prompt =
      thread.messages.length === 1
        ? thread.messages[0].text
        : 'Comment thread on the quoted passage:\n\n' +
          thread.messages
            .map((m) => `${m.author === 'you' ? 'Author' : 'Claude'}: ${m.text}`)
            .join('\n')
    const busy = ['starting', 'working'].includes(get().agent[id]?.status ?? '')
    if (busy) {
      set({
        queuedCommentSends: [
          ...get().queuedCommentSends.filter((q) => q.commentId !== thread.id),
          { commentId: thread.id, prompt, quote: thread.anchor.text }
        ]
      })
      return
    }
    get().askClaude(prompt, { quote: thread.anchor.text, commentId: thread.id })
  },

  resolveThread: async (threadId, status) => {
    const id = get().activeProjectId
    const docFile = get().activeDoc
    if (!id || !docFile) return
    await window.fabulist.comments.setStatus(id, docFile, threadId, status)
    await get().reloadThreads()
  },

  removeThread: async (threadId) => {
    const id = get().activeProjectId
    const docFile = get().activeDoc
    if (!id || !docFile) return
    await window.fabulist.comments.remove(id, docFile, threadId)
    if (get().activeThreadId === threadId) set({ activeThreadId: null })
    await get().reloadThreads()
  },

  setActiveThread: (threadId) => set({ activeThreadId: threadId }),

  jumpToThread: (threadId) => {
    set({ activeThreadId: threadId, scrollTo: { threadId, seq: extSeq++ } })
  },

  loadAgentThreads: async () => {
    const id = get().activeProjectId
    if (!id) return
    const threads = await window.fabulist.agent.threads(id)
    set({ agentThreads: { ...get().agentThreads, [id]: threads } })
  },

  createAgentThread: async () => {
    const id = get().activeProjectId
    if (!id) return
    const thread = await window.fabulist.agent.createThread(id)
    set({
      agentThreads: { ...get().agentThreads, [id]: [...(get().agentThreads[id] ?? []), thread] },
      activeThread: { ...get().activeThread, [id]: thread.id },
      chats: { ...get().chats, [thread.id]: [] },
      tab: 'chat',
      sidebarOpen: true
    })
  },

  selectAgentThread: async (threadId) => {
    const id = get().activeProjectId
    if (!id || get().activeThread[id] === threadId) return
    await window.fabulist.agent.activateThread(id, threadId)
    let chats = get().chats
    if (!chats[threadId]) {
      const chat = await window.fabulist.agent.threadChat(id, threadId)
      chats = { ...chats, [threadId]: chat ?? [] }
    }
    set({ activeThread: { ...get().activeThread, [id]: threadId }, chats, tab: 'chat', sidebarOpen: true })
  },

  renameAgentThread: async (threadId, title) => {
    const id = get().activeProjectId
    if (!id || !title.trim()) return
    await window.fabulist.agent.renameThread(id, threadId, title.trim())
    await get().loadAgentThreads()
  },

  deleteAgentThread: async (threadId) => {
    const id = get().activeProjectId
    if (!id) return
    const { activeThreadId } = await window.fabulist.agent.deleteThread(id, threadId)
    let chats = get().chats
    if (!chats[activeThreadId]) {
      const chat = await window.fabulist.agent.threadChat(id, activeThreadId)
      chats = { ...chats, [activeThreadId]: chat ?? [] }
    }
    set({ activeThread: { ...get().activeThread, [id]: activeThreadId }, chats })
    await get().loadAgentThreads()
  },

  askClaude: (prompt, opts = {}) => {
    const id = get().activeProjectId
    if (!id || (!prompt.trim() && !opts.attachments?.length)) return
    const threadId = get().activeThread[id]
    if (!threadId) return
    if (opts.commentId) set({ pendingCommentId: opts.commentId, sidebarOpen: true })
    else set({ tab: 'chat', sidebarOpen: true })
    void get().flushWrite()
    window.fabulist.agent.send(id, threadId, prompt.trim(), {
      ...opts,
      docFile: get().activeDoc ?? undefined
    })
  },

  setModel: (model) => {
    const id = get().activeProjectId
    if (!id) return
    set({ model })
    window.fabulist.project.setModel(id, model).catch(() => {})
  },

  setFont: (font) => {
    const id = get().activeProjectId
    const docFile = get().activeDoc
    if (!id || !docFile) return
    set({ font })
    window.fabulist.doc.setFont(id, docFile, font).catch(() => {})
  },

  loadModels: async () => {
    const fromEngine = await window.fabulist.agent.models().catch(() => [])
    if (fromEngine.length === 0) return
    const engineDefault = fromEngine.find((m) => m.value === 'default')
    const rest = fromEngine.filter((m) => m.value !== 'default')
    const defaultChoice = engineDefault
      ? {
          value: '',
          label: engineDefault.hint.split('·')[0].trim() || engineDefault.label,
          hint: engineDefault.hint
        }
      : DEFAULT_MODEL_CHOICE
    set({ models: [defaultChoice, ...rest] })
  },

  interrupt: () => {
    const id = get().activeProjectId
    if (id) window.fabulist.agent.interrupt(id)
  },

  respondPermission: (requestId, approved) => {
    window.fabulist.agent.respondPermission(requestId, approved)
  },

  setInlineSuggestion: (requestId) => {
    if (get().inlineSuggestionId !== requestId) set({ inlineSuggestionId: requestId })
  },

  setAutoApprove: (on) => {
    localStorage.setItem('fabulist:autoApprove', on ? '1' : '0')
    set({ autoApprove: on })
  },

  loadHistory: async () => {
    const id = get().activeProjectId
    if (!id) return
    set({ commits: await window.fabulist.history.log(id) })
  },

  openPreview: async (commit) => {
    const id = get().activeProjectId
    const docFile = get().activeDoc
    if (!id || !docFile) return
    const content = await window.fabulist.history.show(id, docFile, commit.hash)
    set({ preview: { hash: commit.hash, content, subject: commit.subject } })
  },

  closePreview: () => set({ preview: null }),

  restorePreview: async () => {
    const id = get().activeProjectId
    const docFile = get().activeDoc
    const preview = get().preview
    if (!id || !docFile || !preview) return
    await get().flushWrite()
    const content = await window.fabulist.history.restore(id, docFile, preview.hash)
    set({
      preview: null,
      content,
      docContents: { ...get().docContents, [docFile]: content },
      external: { seq: extSeq++, content },
      threads: reanchor(get().threads, content)
    })
    await get().loadHistory()
  },

  handleAgentEvent: (e) => {
    const { activeProjectId } = get()
    const updateChat = (threadId: string, fn: (items: ChatItem[]) => ChatItem[]): void => {
      const chats = get().chats
      set({ chats: { ...chats, [threadId]: fn(chats[threadId] ?? []) } })
    }
    const upsertAssistant = (
      threadId: string,
      itemId: string,
      fn: (item: ChatItem) => ChatItem
    ): void => {
      updateChat(threadId, (items) => {
        const idx = items.findIndex((i) => i.id === itemId)
        if (idx === -1) {
          return [...items, fn({ id: itemId, role: 'assistant', text: '', at: Date.now(), toolNotes: [] })]
        }
        const next = [...items]
        next[idx] = fn(next[idx])
        return next
      })
    }

    switch (e.kind) {
      case 'status':
        set({ agent: { ...get().agent, [e.projectId]: { status: e.status, detail: e.detail } } })
        break
      case 'user-echo':
        updateChat(e.threadId, (items) => [
          ...items,
          {
            id: e.itemId,
            role: 'user',
            text: e.text,
            quote: e.quote,
            attachments: e.attachments,
            at: Date.now()
          }
        ])
        break
      case 'text-delta':
        upsertAssistant(e.threadId, e.itemId, (item) => ({
          ...item,
          text: item.streaming ? item.text + e.delta : e.delta,
          streaming: true
        }))
        break
      case 'assistant-text':
        upsertAssistant(e.threadId, e.itemId, (item) => ({ ...item, text: e.text, streaming: false }))
        break
      case 'tool-note':
        upsertAssistant(e.threadId, e.itemId, (item) => {
          const notes = [...(item.toolNotes ?? [])]
          const idx = notes.findIndex((n) => n.toolId === e.toolId)
          if (idx === -1 && !e.done) notes.push({ toolId: e.toolId, note: e.note })
          else if (idx !== -1) notes[idx] = { ...notes[idx], done: e.done, ok: e.ok }
          return { ...item, toolNotes: notes, streaming: false }
        })
        break
      case 'permission-request':
        // auto-accept file edits when the author has opted in — Bash commands
        // (carried as request.command) always prompt, no matter the setting
        if (get().autoApprove && !e.request.command) {
          get().respondPermission(e.request.requestId, true)
          break
        }
        if (
          e.projectId === activeProjectId &&
          !get().permissions.some((p) => p.requestId === e.request.requestId)
        ) {
          // an edit to the focused doc renders inline in the editor; everything
          // else (other docs, Bash) shows as a card in the chat tab
          const inline = e.request.filePath === get().activeDoc
          set({
            permissions: [...get().permissions, e.request],
            sidebarOpen: true,
            ...(inline ? {} : { tab: 'chat' as const })
          })
        }
        break
      case 'permission-resolved':
        set({ permissions: get().permissions.filter((p) => p.requestId !== e.requestId) })
        break
      case 'result': {
        if (!e.ok && e.error) {
          updateChat(e.threadId, (items) => [
            ...items,
            { id: `err-${Date.now()}`, role: 'assistant', text: '', at: Date.now(), error: e.error }
          ])
        }
        const chat = get().chats[e.threadId]
        if (chat) window.fabulist.agent.saveChat(e.projectId, e.threadId, chat.slice(-200)).catch(() => {})
        if (e.commentId === get().pendingCommentId) set({ pendingCommentId: null })
        if (e.projectId === activeProjectId) {
          get().loadHistory()
          get().loadDocs()
          get().loadProjects()
          get().loadAgentThreads()
          // reload comments if the reply landed on the focused doc
          if (e.commentId && e.docFile === get().activeDoc) get().reloadThreads()
          const [next, ...rest] = get().queuedCommentSends
          if (next) {
            set({ queuedCommentSends: rest })
            get().askClaude(next.prompt, { quote: next.quote, commentId: next.commentId })
          }
        }
        break
      }
    }
  },

  handleExternalChange: (projectId, docFile, content) => {
    if (get().activeProjectId !== projectId) return
    // cache for any open tab; only re-render the editor if it's the live doc
    if (get().openDocs.includes(docFile) || get().activeDoc === docFile) {
      set({ docContents: { ...get().docContents, [docFile]: content } })
    }
    if (get().activeDoc === docFile) {
      set({
        content,
        external: { seq: extSeq++, content },
        threads: reanchor(get().threads, content)
      })
    }
    get().loadDocs()
  }
}))
