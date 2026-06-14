import type { StateCreator } from 'zustand'
import type { HistorySlice, Store } from './types'
import { nextSeq, reanchor } from './shared'

export const createHistorySlice: StateCreator<Store, [], [], HistorySlice> = (set, get) => ({
  commits: [],
  preview: null,

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
      external: { seq: nextSeq(), content },
      threads: reanchor(get().threads, content)
    })
    await get().loadHistory()
  }
})
