import type { StateCreator } from 'zustand'
import type { ChatItem } from '@shared/types'
import type { ChatSlice, Store } from './types'
import { nextSeq } from './shared'

export const createChatSlice: StateCreator<Store, [], [], ChatSlice> = (set, get) => ({
  chats: {},
  agent: {},
  pendingCommentId: null,
  revealPos: null,

  askClaude: async (prompt, opts = {}) => {
    const id = get().activeId
    if (!id || !prompt.trim()) return
    // comment-initiated prompts reply into the thread — stay where the user is
    if (opts.commentId) set({ pendingCommentId: opts.commentId, sidebarOpen: true })
    else set({ tab: 'chat', sidebarOpen: true })
    await get().flushWrite()
    await window.fabulist.agent.send(id, prompt.trim(), opts)
  },

  interrupt: () => {
    const id = get().activeId
    if (id) window.fabulist.agent.interrupt(id)
  },

  revealEdit: (edit) => {
    // locate by the inserted text (fall back to the replaced text) in the
    // current content — positions from the edit itself would be stale
    const { content } = get()
    const needle = [edit.after, edit.before].find((s) => s && content.includes(s))
    if (needle === undefined) return
    set({ revealPos: { pos: content.indexOf(needle), seq: nextSeq() } })
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
        if (!get().permissions.some((p) => p.requestId === e.request.requestId)) {
          // document edits render inline in the editor — only pull the user to
          // the chat tab for requests that have nowhere else to appear
          const inline = e.request.filePath === 'document.md'
          set({
            permissions: [...get().permissions, e.request],
            // never steal focus for a background document's request — its
            // card renders when that document becomes active again
            ...(e.docId === activeId
              ? { sidebarOpen: true, ...(inline ? {} : { tab: 'chat' as const }) }
              : {})
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
            void get().askClaude(next.prompt, { quote: next.quote, commentId: next.commentId })
          }
        }
        break
      }
    }
  }
})
