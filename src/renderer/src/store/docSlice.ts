import type { StateCreator } from 'zustand'
import { DEFAULT_FONT } from '@shared/types'
import { locateAnchor } from '@/lib/anchors'
import type { DocSlice, Store } from './types'
import { nextSeq, reanchor } from './shared'

let writeTimer: ReturnType<typeof setTimeout> | null = null
let idleCommitTimer: ReturnType<typeof setTimeout> | null = null

export const createDocSlice: StateCreator<Store, [], [], DocSlice> = (set, get) => ({
  docs: [],
  activeId: null,
  content: '',
  external: null,
  tab: 'chat',
  sidebarOpen: true,
  libraryOpen: true,

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
      external: { seq: nextSeq(), content },
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

  handleExternalChange: (id, content) => {
    if (get().activeId !== id) return
    // the draft highlight must follow its text like threads do — stale offsets
    // would paint random text after Claude's edits; if the text is gone, drop it
    const draft = get().draftComment
    const draftLoc = draft ? locateAnchor(content, draft.anchor) : null
    set({
      content,
      external: { seq: nextSeq(), content },
      threads: reanchor(get().threads, content),
      draftComment:
        draft && draftLoc
          ? { anchor: { ...draft.anchor, from: draftLoc.from, to: draftLoc.to } }
          : null
    })
  }
})
