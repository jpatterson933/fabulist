import type { StateCreator } from 'zustand'
import type { CommentsSlice, Store } from './types'
import { nextSeq, reanchor } from './shared'

let anchorTimer: ReturnType<typeof setTimeout> | null = null

export const createCommentsSlice: StateCreator<Store, [], [], CommentsSlice> = (set, get) => ({
  threads: [],
  draftComment: null,
  activeThreadId: null,
  scrollTo: null,
  queuedCommentSends: [],

  reloadThreads: async () => {
    const id = get().activeId
    if (!id) return
    const raw = await window.fabulist.comments.list(id)
    set({ threads: reanchor(raw, get().content) })
  },

  clearCommentDrafts: () =>
    set({ draftComment: null, activeThreadId: null, queuedCommentSends: [], scrollTo: null }),

  resetComments: () =>
    set({ threads: [], draftComment: null, activeThreadId: null, queuedCommentSends: [], scrollTo: null }),

  sendNextQueuedComment: () => {
    const [next, ...rest] = get().queuedCommentSends
    if (!next) return
    set({ queuedCommentSends: rest })
    void get().askClaude(next.prompt, { quote: next.quote, commentId: next.commentId })
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
          threads
            .filter((t) => t.status !== 'resolved')
            .map((t) => ({ id: t.id, anchor: t.anchor, status: t.status }))
        )
        .catch(() => {})
    }, 800)
  },

  startDraftComment: (anchor) =>
    set({ draftComment: { anchor, text: '' }, tab: 'comments', sidebarOpen: true }),
  setDraftCommentText: (text) => {
    const draft = get().draftComment
    if (draft) set({ draftComment: { ...draft, text } })
  },
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
    void get().askClaude(prompt, { quote: thread.anchor.text, commentId: thread.id })
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
      scrollTo: { threadId, seq: nextSeq() }
    })
  }
})
