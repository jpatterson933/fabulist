import { create } from 'zustand'
import {
  DEFAULT_FONT,
  DEFAULT_MODEL_CHOICE,
  FALLBACK_MODEL_CHOICES,
  type AgentEvent,
  type ChatItem,
  type CommentAnchor,
  type CommentThread,
  type CommitInfo,
  type DocMeta,
  type ModelChoice,
  type PermissionRequest
} from '@shared/types'
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
  docs: DocMeta[]
  activeId: string | null
  content: string
  external: ExternalUpdate | null
  threads: CommentThread[]
  chats: Record<string, ChatItem[]>
  permissions: PermissionRequest[]
  agent: Record<string, AgentState>
  tab: SidebarTab
  sidebarOpen: boolean
  libraryOpen: boolean
  commits: CommitInfo[]
  preview: { hash: string; content: string; subject: string } | null
  model: string
  models: ModelChoice[]
  /** apply Claude's file edits without asking (per document) */
  autoApprove: boolean
  font: string
  draftComment: DraftComment | null
  activeThreadId: string | null
  /** requestId of a permission currently rendered as an in-document suggestion */
  inlineSuggestionId: string | null
  /** thread Claude is currently replying to */
  pendingCommentId: string | null
  /** comment prompts waiting for the agent to free up */
  queuedCommentSends: { commentId: string; prompt: string; quote: string }[]
  scrollTo: { threadId: string; seq: number } | null
  /** opt-in scroll request to a document offset (e.g. "Show in document" on an edit card) */
  revealPos: { pos: number; seq: number } | null

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

  reloadThreads: () => Promise<void>
  persistAnchors: (
    anchors: { id: string; from: number; to: number }[]
  ) => void
  startDraftComment: (anchor: CommentAnchor) => void
  cancelDraftComment: () => void
  submitDraftComment: (text: string) => Promise<void>
  replyToThread: (threadId: string, text: string) => Promise<void>
  resolveThread: (threadId: string, status: CommentThread['status']) => Promise<void>
  removeThread: (threadId: string) => Promise<void>
  setActiveThread: (threadId: string | null) => void
  jumpToThread: (threadId: string) => void

  askClaude: (prompt: string, opts?: { quote?: string; commentId?: string }) => void
  /** send a comment thread to Claude now, or queue it if the agent is busy */
  engageClaudeOnThread: (thread: CommentThread) => void
  setModel: (model: string) => void
  setAutoApprove: (on: boolean) => void
  loadModels: () => Promise<void>
  setFont: (font: string) => void
  interrupt: () => void
  respondPermission: (requestId: string, approved: boolean) => void
  setInlineSuggestion: (requestId: string | null) => void
  /** scroll the editor to where an applied edit landed (best-effort, by quote) */
  revealEdit: (edit: NonNullable<ChatItem['edit']>) => void

  loadHistory: () => Promise<void>
  openPreview: (commit: CommitInfo) => Promise<void>
  closePreview: () => void
  restorePreview: () => Promise<void>

  handleAgentEvent: (e: AgentEvent) => void
  handleExternalChange: (id: string, content: string) => void
}

let writeTimer: ReturnType<typeof setTimeout> | null = null
let idleCommitTimer: ReturnType<typeof setTimeout> | null = null
let anchorTimer: ReturnType<typeof setTimeout> | null = null
let extSeq = 1

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
  docs: [],
  activeId: null,
  content: '',
  external: null,
  threads: [],
  chats: {},
  permissions: [],
  agent: {},
  tab: 'chat',
  sidebarOpen: true,
  libraryOpen: true,
  commits: [],
  preview: null,
  model: '',
  models: FALLBACK_MODEL_CHOICES,
  autoApprove: false,
  font: DEFAULT_FONT,
  draftComment: null,
  activeThreadId: null,
  inlineSuggestionId: null,
  pendingCommentId: null,
  queuedCommentSends: [],
  scrollTo: null,
  revealPos: null,

  loadDocs: async () => {
    set({ docs: await window.fabulist.library.list() })
  },

  createDoc: async (title) => {
    const meta = await window.fabulist.library.create(title)
    await get().loadDocs()
    await get().openDoc(meta.id)
  },

  deleteDoc: async (id) => {
    if (get().activeId === id) await get().closeDoc()
    await window.fabulist.library.remove(id)
    await get().loadDocs()
  },

  openDoc: async (id) => {
    await get().closeDoc()
    const [content, rawThreads, chat, commits, model, font, autoApprove] = await Promise.all([
      window.fabulist.doc.read(id),
      window.fabulist.comments.list(id),
      window.fabulist.doc.chat(id),
      window.fabulist.history.log(id),
      window.fabulist.doc.getModel(id),
      window.fabulist.doc.getFont(id),
      window.fabulist.doc.getAutoApprove(id)
    ])
    const threads = reanchor(rawThreads, content)
    set({
      activeId: id,
      content,
      external: { seq: extSeq++, content },
      threads,
      commits,
      model,
      autoApprove,
      font: font || DEFAULT_FONT,
      preview: null,
      draftComment: null,
      activeThreadId: null,
      permissions: [],
      inlineSuggestionId: null,
      pendingCommentId: null,
      queuedCommentSends: [],
      chats: { ...get().chats, [id]: chat ?? [] }
    })
    // watching also re-emits any permission requests pending for this doc
    await window.fabulist.doc.watch(id)
  },

  closeDoc: async () => {
    const id = get().activeId
    if (!id) return
    await get().flushWrite()
    await window.fabulist.doc.snapshot(id, 'Edited').catch(() => {})
    await window.fabulist.doc.watch(null)
    set({ activeId: null, content: '', threads: [], commits: [], preview: null })
  },

  setContent: (content) => {
    const id = get().activeId
    if (!id) return
    set({ content })
    if (writeTimer) clearTimeout(writeTimer)
    writeTimer = setTimeout(() => {
      writeTimer = null
      window.fabulist.doc.write(id, get().content).catch(() => {})
    }, 400)
    if (idleCommitTimer) clearTimeout(idleCommitTimer)
    idleCommitTimer = setTimeout(async () => {
      idleCommitTimer = null
      if (get().activeId !== id) return
      await get().flushWrite()
      const committed = await window.fabulist.doc.snapshot(id, 'Edited').catch(() => false)
      if (committed) get().loadHistory()
    }, 60_000)
  },

  flushWrite: async () => {
    const id = get().activeId
    if (!id) return
    if (writeTimer) {
      clearTimeout(writeTimer)
      writeTimer = null
      await window.fabulist.doc.write(id, get().content).catch(() => {})
    }
  },

  snapshot: async (label) => {
    const id = get().activeId
    if (!id) return
    await get().flushWrite()
    await window.fabulist.doc.snapshot(id, label)
    await get().loadHistory()
  },

  setTab: (tab) => set({ tab, sidebarOpen: true }),
  toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
  toggleLibrary: () => set({ libraryOpen: !get().libraryOpen }),

  reloadThreads: async () => {
    const id = get().activeId
    if (!id) return
    const raw = await window.fabulist.comments.list(id)
    set({ threads: reanchor(raw, get().content) })
  },

  // Editor reports mapped positions after edits; recompute context and persist.
  persistAnchors: (anchors) => {
    const id = get().activeId
    if (!id) return
    const content = get().content
    const threads = get().threads.map((t) => {
      const a = anchors.find((x) => x.id === t.id)
      if (!a) return t
      const text = content.slice(a.from, a.to)
      return {
        ...t,
        status: text === t.anchor.text ? t.status : t.status, // text drift handled below
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
          threads.filter((t) => t.status !== 'resolved').map((t) => ({ id: t.id, anchor: t.anchor, status: t.status }))
        )
        .catch(() => {})
    }, 800)
  },

  startDraftComment: (anchor) => set({ draftComment: { anchor }, tab: 'comments', sidebarOpen: true }),
  cancelDraftComment: () => set({ draftComment: null }),

  submitDraftComment: async (text) => {
    const id = get().activeId
    const draft = get().draftComment
    if (!id || !draft || !text.trim()) return
    const thread = await window.fabulist.comments.add(id, draft.anchor, text.trim())
    set({ draftComment: null, activeThreadId: thread.id })
    await get().reloadThreads()
    get().engageClaudeOnThread(thread)
  },

  replyToThread: async (threadId, text) => {
    const id = get().activeId
    if (!id || !text.trim()) return
    const thread = await window.fabulist.comments.reply(id, threadId, text.trim())
    await get().reloadThreads()
    if (thread) get().engageClaudeOnThread(thread)
  },

  // every comment engages Claude; if it's mid-run, queue and send when free
  engageClaudeOnThread: (thread) => {
    const id = get().activeId
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
    const id = get().activeId
    if (!id) return
    await window.fabulist.comments.setStatus(id, threadId, status)
    await get().reloadThreads()
  },

  removeThread: async (threadId) => {
    const id = get().activeId
    if (!id) return
    await window.fabulist.comments.remove(id, threadId)
    if (get().activeThreadId === threadId) set({ activeThreadId: null })
    await get().reloadThreads()
  },

  setActiveThread: (threadId) => set({ activeThreadId: threadId }),

  jumpToThread: (threadId) => {
    set({
      activeThreadId: threadId,
      tab: 'comments',
      sidebarOpen: true,
      scrollTo: { threadId, seq: extSeq++ }
    })
  },

  askClaude: (prompt, opts = {}) => {
    const id = get().activeId
    if (!id || !prompt.trim()) return
    // comment-initiated prompts reply into the thread — stay where the user is
    if (opts.commentId) set({ pendingCommentId: opts.commentId, sidebarOpen: true })
    else set({ tab: 'chat', sidebarOpen: true })
    void get().flushWrite()
    window.fabulist.agent.send(id, prompt.trim(), opts)
  },

  setModel: (model) => {
    const id = get().activeId
    if (!id) return
    set({ model })
    window.fabulist.doc.setModel(id, model).catch(() => {})
  },

  revealEdit: (edit) => {
    // locate by the inserted text (fall back to the replaced text) in the
    // current content — positions from the edit itself would be stale
    const { content } = get()
    const needle = [edit.after, edit.before].find((s) => s && content.includes(s))
    if (needle === undefined) return
    set({ revealPos: { pos: content.indexOf(needle), seq: extSeq++ } })
  },

  setAutoApprove: (on) => {
    const id = get().activeId
    if (!id) return
    set({ autoApprove: on })
    window.fabulist.doc.setAutoApprove(id, on).catch(() => {})
  },

  setFont: (font) => {
    const id = get().activeId
    if (!id) return
    set({ font })
    window.fabulist.doc.setFont(id, font).catch(() => {})
  },

  loadModels: async () => {
    const fromEngine = await window.fabulist.agent.models().catch(() => [])
    if (fromEngine.length === 0) return
    // the engine lists its own "default" row; fold it into our '' sentinel
    // ('' = omit the model option entirely, letting the CLI pick its default)
    const engineDefault = fromEngine.find((m) => m.value === 'default')
    const rest = fromEngine.filter((m) => m.value !== 'default')
    const defaultChoice = engineDefault
      ? { value: '', label: engineDefault.label, hint: engineDefault.hint }
      : DEFAULT_MODEL_CHOICE
    set({ models: [defaultChoice, ...rest] })
  },

  interrupt: () => {
    const id = get().activeId
    if (id) window.fabulist.agent.interrupt(id)
  },

  respondPermission: (requestId, approved) => {
    window.fabulist.agent.respondPermission(requestId, approved)
  },

  setInlineSuggestion: (requestId) => {
    if (get().inlineSuggestionId !== requestId) set({ inlineSuggestionId: requestId })
  },

  loadHistory: async () => {
    const id = get().activeId
    if (!id) return
    set({ commits: await window.fabulist.history.log(id) })
  },

  openPreview: async (commit) => {
    const id = get().activeId
    if (!id) return
    const content = await window.fabulist.history.show(id, commit.hash)
    set({ preview: { hash: commit.hash, content, subject: commit.subject } })
  },

  closePreview: () => set({ preview: null }),

  restorePreview: async () => {
    const id = get().activeId
    const preview = get().preview
    if (!id || !preview) return
    await get().flushWrite()
    const content = await window.fabulist.history.restore(id, preview.hash)
    set({
      preview: null,
      content,
      external: { seq: extSeq++, content },
      threads: reanchor(get().threads, content)
    })
    await get().loadHistory()
  },

  handleAgentEvent: (e) => {
    const { activeId } = get()
    const updateChat = (docId: string, fn: (items: ChatItem[]) => ChatItem[]): void => {
      const chats = get().chats
      set({ chats: { ...chats, [docId]: fn(chats[docId] ?? []) } })
    }
    const upsertAssistant = (
      docId: string,
      itemId: string,
      fn: (item: ChatItem) => ChatItem
    ): void => {
      updateChat(docId, (items) => {
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
        set({ agent: { ...get().agent, [e.docId]: { status: e.status, detail: e.detail } } })
        break
      case 'user-echo':
        updateChat(e.docId, (items) => [
          ...items,
          { id: e.itemId, role: 'user', text: e.text, quote: e.quote, at: Date.now() }
        ])
        break
      case 'text-delta':
        upsertAssistant(e.docId, e.itemId, (item) => ({
          ...item,
          text: item.streaming ? item.text + e.delta : e.delta,
          streaming: true
        }))
        break
      case 'assistant-text':
        upsertAssistant(e.docId, e.itemId, (item) => ({ ...item, text: e.text, streaming: false }))
        break
      case 'tool-note':
        upsertAssistant(e.docId, e.itemId, (item) => {
          const notes = [...(item.toolNotes ?? [])]
          const idx = notes.findIndex((n) => n.toolId === e.toolId)
          if (idx === -1 && !e.done) notes.push({ toolId: e.toolId, note: e.note })
          else if (idx !== -1) notes[idx] = { ...notes[idx], done: e.done, ok: e.ok }
          return { ...item, toolNotes: notes, streaming: false }
        })
        break
      case 'permission-request':
        if (e.docId === activeId && !get().permissions.some((p) => p.requestId === e.request.requestId)) {
          // document edits render inline in the editor — only pull the user to
          // the chat tab for requests that have nowhere else to appear
          const inline = e.request.filePath === 'document.md'
          set({
            permissions: [...get().permissions, e.request],
            sidebarOpen: true,
            ...(inline ? {} : { tab: 'chat' as const })
          })
        }
        break
      case 'edit-applied':
        updateChat(e.docId, (items) => [
          ...items,
          {
            id: e.request.requestId,
            role: 'assistant',
            text: '',
            at: Date.now(),
            edit: {
              tool: e.request.tool,
              filePath: e.request.filePath,
              before: e.request.before ?? '',
              after: e.request.after ?? ''
            }
          }
        ])
        break
      case 'permission-resolved':
        set({ permissions: get().permissions.filter((p) => p.requestId !== e.requestId) })
        break
      case 'result': {
        if (!e.ok && e.error) {
          updateChat(e.docId, (items) => [
            ...items,
            { id: `err-${Date.now()}`, role: 'assistant', text: '', at: Date.now(), error: e.error }
          ])
        }
        const chat = get().chats[e.docId]
        if (chat) window.fabulist.doc.saveChat(e.docId, chat.slice(-200)).catch(() => {})
        if (e.commentId === get().pendingCommentId) set({ pendingCommentId: null })
        if (e.docId === activeId) {
          get().loadHistory()
          get().loadDocs()
          if (e.commentId) get().reloadThreads()
          // a comment may have queued while Claude was busy — send it now
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

  handleExternalChange: (id, content) => {
    if (get().activeId !== id) return
    set({
      content,
      external: { seq: extSeq++, content },
      threads: reanchor(get().threads, content)
    })
  }
}))
