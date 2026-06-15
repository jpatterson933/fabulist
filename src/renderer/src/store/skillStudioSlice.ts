import type { StateCreator } from 'zustand'
import type { ChatItem, RunUsage } from '@shared/types'
import type { SkillStudioSlice, Store, UsageTotals } from './types'

// The Skill Studio slice — owns the `mode` switch, the authored-skill list + file
// editor buffer, and the per-skill test-thread transcript. Self-contained: no other
// slice reads these fields, and this reducer never reaches into doc state.

let fileTimer: ReturnType<typeof setTimeout> | null = null

/** Fold one run's usage into the running per-skill totals (client tracks token spend). */
function addUsage(prev: UsageTotals | undefined, u: RunUsage): UsageTotals {
  return {
    inputTokens: (prev?.inputTokens ?? 0) + u.inputTokens,
    outputTokens: (prev?.outputTokens ?? 0) + u.outputTokens,
    cacheReadTokens: (prev?.cacheReadTokens ?? 0) + u.cacheReadTokens,
    cacheCreationTokens: (prev?.cacheCreationTokens ?? 0) + u.cacheCreationTokens,
    costUsd: (prev?.costUsd ?? 0) + (u.costUsd ?? 0),
    runs: (prev?.runs ?? 0) + 1
  }
}

export const createSkillStudioSlice: StateCreator<Store, [], [], SkillStudioSlice> = (set, get) => ({
  mode: 'doc',
  studioRailOpen: true,
  studioTab: 'chat',
  studioSkills: [],
  activeSkill: null,
  studioFiles: [],
  openFilePath: null,
  fileContent: '',
  fileDirty: false,
  authChats: {},
  authAgent: {},
  comments: {},
  studioDraft: null,
  testChats: {},
  testAgent: {},
  authUsage: {},
  testUsage: {},

  openStudio: async () => {
    set({ mode: 'skillStudio' })
    await get().loadStudioSkills()
  },

  closeStudio: () => {
    void get().flushStudioFile()
    set({ mode: 'doc' })
  },

  toggleStudioRail: () => set({ studioRailOpen: !get().studioRailOpen }),

  setStudioTab: (tab) => set({ studioTab: tab }),

  loadStudioSkills: async () => {
    try {
      set({ studioSkills: await window.fabulist.skillStudio.list() })
    } catch (e) {
      get().reportError(e, 'Couldn’t load skills')
    }
  },

  createStudioSkill: async (name) => {
    if (!name.trim()) return
    try {
      const skill = await window.fabulist.skillStudio.create(name.trim())
      await get().loadStudioSkills()
      await get().openStudioSkill(skill.slug)
    } catch (e) {
      get().reportError(e, 'Couldn’t create the skill')
    }
  },

  deleteStudioSkill: async (slug) => {
    try {
      await window.fabulist.skillStudio.remove(slug)
      if (get().activeSkill === slug) {
        set({ activeSkill: null, studioFiles: [], openFilePath: null, fileContent: '', fileDirty: false })
      }
      await get().loadStudioSkills()
    } catch (e) {
      get().reportError(e, 'Couldn’t delete the skill')
    }
  },

  openStudioSkill: async (slug) => {
    await get().flushStudioFile()
    set({ activeSkill: slug, openFilePath: null, fileContent: '', fileDirty: false, studioDraft: null })
    await get().loadStudioFiles(slug)
    // SKILL.md is the deliverable — open it by default (it lives at skills/<slug>/SKILL.md)
    const skillFile = `skills/${slug}/SKILL.md`
    if (get().studioFiles.some((f) => f.rel === skillFile)) await get().openStudioFile(skillFile)
  },

  loadStudioFiles: async (slug) => {
    try {
      set({ studioFiles: await window.fabulist.skillStudio.listFiles(slug) })
    } catch (e) {
      get().reportError(e, 'Couldn’t load the skill’s files')
    }
  },

  openStudioFile: async (rel) => {
    const slug = get().activeSkill
    if (!slug) return
    await get().flushStudioFile()
    try {
      const content = await window.fabulist.skillStudio.readFile(slug, rel)
      set({ openFilePath: rel, fileContent: content, fileDirty: false })
    } catch (e) {
      get().reportError(e, 'Couldn’t open the file')
    }
  },

  setFileContent: (text) => {
    const { activeSkill, openFilePath } = get()
    if (!activeSkill || !openFilePath) return
    set({ fileContent: text, fileDirty: true })
    if (fileTimer) clearTimeout(fileTimer)
    fileTimer = setTimeout(() => {
      fileTimer = null
      window.fabulist.skillStudio
        .writeFile(activeSkill, openFilePath, get().fileContent)
        .then(() => set({ fileDirty: false }))
        .catch((e) => get().reportError(e, 'Couldn’t save the file'))
    }, 400)
  },

  flushStudioFile: async () => {
    const { activeSkill, openFilePath, fileDirty } = get()
    if (!activeSkill || !openFilePath || !fileDirty) return
    if (fileTimer) {
      clearTimeout(fileTimer)
      fileTimer = null
    }
    await window.fabulist.skillStudio
      .writeFile(activeSkill, openFilePath, get().fileContent)
      .then(() => set({ fileDirty: false }))
      .catch((e) => get().reportError(e, 'Couldn’t save the file'))
  },

  addStudioFile: async (rel) => {
    const slug = get().activeSkill
    if (!slug || !rel.trim()) return
    try {
      await window.fabulist.skillStudio.createFile(slug, rel.trim())
      await get().loadStudioFiles(slug)
      await get().openStudioFile(rel.trim())
    } catch (e) {
      get().reportError(e, 'Couldn’t create the file')
    }
  },

  addStudioFolder: async (rel) => {
    const slug = get().activeSkill
    if (!slug || !rel.trim()) return
    try {
      await window.fabulist.skillStudio.createFolder(slug, rel.trim())
      await get().loadStudioFiles(slug)
    } catch (e) {
      get().reportError(e, 'Couldn’t create the folder')
    }
  },

  removeStudioFile: async (rel) => {
    const slug = get().activeSkill
    if (!slug) return
    try {
      await window.fabulist.skillStudio.deleteFile(slug, rel)
      // If the open file was deleted — or lived inside a deleted folder — drop the
      // buffer AND cancel any pending autosave, which would otherwise re-create the
      // file (writeFile mkdir's its parents) right after the delete.
      const open = get().openFilePath
      if (open === rel || open?.startsWith(`${rel}/`)) {
        if (fileTimer) {
          clearTimeout(fileTimer)
          fileTimer = null
        }
        set({ openFilePath: null, fileContent: '', fileDirty: false })
      }
      await get().loadStudioFiles(slug)
    } catch (e) {
      get().reportError(e, 'Couldn’t delete the file')
    }
  },

  authSend: async (prompt) => {
    const slug = get().activeSkill
    if (!slug || !prompt.trim()) return
    set({ studioTab: 'chat' })
    // make sure the user's latest edits are on disk before Claude reads the files
    await get().flushStudioFile()
    await window.fabulist.skillStudio
      .authSend(slug, prompt.trim())
      .catch((e) => get().reportError(e, 'Couldn’t reach Claude'))
  },

  interruptAuth: () => {
    const slug = get().activeSkill
    if (slug) void window.fabulist.skillStudio.authInterrupt(slug)
  },

  handleAuthEvent: (e) => {
    const slug = e.docId
    const updateChat = (fn: (items: ChatItem[]) => ChatItem[]): void => {
      const chats = get().authChats
      set({ authChats: { ...chats, [slug]: fn(chats[slug] ?? []) } })
    }
    const upsertAssistant = (itemId: string, fn: (item: ChatItem) => ChatItem): void => {
      updateChat((items) => {
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
        set({ authAgent: { ...get().authAgent, [slug]: e.status } })
        break
      case 'user-echo':
        updateChat((items) => [...items, { id: e.itemId, role: 'user', text: e.text, at: Date.now() }])
        break
      case 'text-delta':
        upsertAssistant(e.itemId, (item) => ({
          ...item,
          text: item.streaming ? item.text + e.delta : e.delta,
          streaming: true
        }))
        break
      case 'assistant-text':
        upsertAssistant(e.itemId, (item) => ({ ...item, text: e.text, streaming: false }))
        break
      case 'tool-note':
        upsertAssistant(e.itemId, (item) => {
          const notes = [...(item.toolNotes ?? [])]
          const idx = notes.findIndex((n) => n.toolId === e.toolId)
          if (idx === -1 && !e.done) notes.push({ toolId: e.toolId, note: e.note })
          else if (idx !== -1) notes[idx] = { ...notes[idx], done: e.done, ok: e.ok }
          return { ...item, toolNotes: notes, streaming: false }
        })
        break
      case 'edit-applied':
        updateChat((items) => [
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
      case 'result': {
        if (!e.ok && e.error) {
          updateChat((items) => [
            ...items,
            { id: `err-${Date.now()}`, role: 'assistant', text: '', at: Date.now(), error: e.error }
          ])
        }
        if (e.usage) {
          updateChat((items) => [
            ...items,
            { id: `use-${Date.now()}`, role: 'assistant', text: '', at: Date.now(), usage: e.usage }
          ])
          set({ authUsage: { ...get().authUsage, [slug]: addUsage(get().authUsage[slug], e.usage) } })
        }
        // Claude may have edited the skill's files — refresh the tree + open file (without
        // clobbering unsaved local edits)
        if (get().activeSkill === slug) {
          void get().loadStudioFiles(slug)
          const open = get().openFilePath
          if (open && !get().fileDirty) {
            window.fabulist.skillStudio
              .readFile(slug, open)
              .then((content) => {
                if (get().activeSkill === slug && get().openFilePath === open && !get().fileDirty) {
                  set({ fileContent: content })
                }
              })
              .catch(() => {})
          }
        }
        break
      }
    }
  },

  startComment: (file, quote) => {
    if (!quote.trim()) return
    set({ studioDraft: { file, quote }, studioTab: 'comments' })
  },

  cancelComment: () => set({ studioDraft: null }),

  submitComment: async (note) => {
    const slug = get().activeSkill
    const draft = get().studioDraft
    if (!slug || !draft || !note.trim()) return
    const comment = {
      id: `c-${Date.now()}`,
      file: draft.file,
      quote: draft.quote,
      note: note.trim(),
      at: Date.now()
    }
    set({
      comments: { ...get().comments, [slug]: [...(get().comments[slug] ?? []), comment] },
      studioDraft: null
    })
    const prompt = `Comment on \`${draft.file}\`:\n\n> ${draft.quote.replace(/\n/g, '\n> ')}\n\n${note.trim()}`
    await get().authSend(prompt)
  },

  removeComment: (id) => {
    const slug = get().activeSkill
    if (!slug) return
    set({ comments: { ...get().comments, [slug]: (get().comments[slug] ?? []).filter((c) => c.id !== id) } })
  },

  testSkill: async (prompt) => {
    const slug = get().activeSkill
    if (!slug || !prompt.trim()) return
    // make sure the latest SKILL.md is on disk before the plugin is loaded for the test
    await get().flushStudioFile()
    await window.fabulist.skillStudio.test(slug, prompt.trim()).catch((e) =>
      get().reportError(e, 'The test run failed to start')
    )
  },

  resetTest: async () => {
    const slug = get().activeSkill
    if (!slug) return
    await window.fabulist.skillStudio.resetTest(slug).catch(() => {})
    const testUsage = { ...get().testUsage }
    delete testUsage[slug]
    set({
      testChats: { ...get().testChats, [slug]: [] },
      testAgent: { ...get().testAgent, [slug]: 'idle' },
      testUsage
    })
  },

  interruptTest: () => {
    const slug = get().activeSkill
    if (slug) void window.fabulist.skillStudio.interruptTest(slug)
  },

  handleStudioEvent: (e) => {
    const slug = e.docId
    const updateChat = (fn: (items: ChatItem[]) => ChatItem[]): void => {
      const chats = get().testChats
      set({ testChats: { ...chats, [slug]: fn(chats[slug] ?? []) } })
    }
    const upsertAssistant = (itemId: string, fn: (item: ChatItem) => ChatItem): void => {
      updateChat((items) => {
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
        set({ testAgent: { ...get().testAgent, [slug]: e.status } })
        break
      case 'user-echo':
        updateChat((items) => [...items, { id: e.itemId, role: 'user', text: e.text, at: Date.now() }])
        break
      case 'text-delta':
        upsertAssistant(e.itemId, (item) => ({
          ...item,
          text: item.streaming ? item.text + e.delta : e.delta,
          streaming: true
        }))
        break
      case 'assistant-text':
        upsertAssistant(e.itemId, (item) => ({ ...item, text: e.text, streaming: false }))
        break
      case 'tool-note':
        upsertAssistant(e.itemId, (item) => {
          const notes = [...(item.toolNotes ?? [])]
          const idx = notes.findIndex((n) => n.toolId === e.toolId)
          if (idx === -1 && !e.done) notes.push({ toolId: e.toolId, note: e.note })
          else if (idx !== -1) notes[idx] = { ...notes[idx], done: e.done, ok: e.ok }
          return { ...item, toolNotes: notes, streaming: false }
        })
        break
      case 'result':
        if (!e.ok && e.error) {
          updateChat((items) => [
            ...items,
            { id: `err-${Date.now()}`, role: 'assistant', text: '', at: Date.now(), error: e.error }
          ])
        }
        if (e.usage) {
          updateChat((items) => [
            ...items,
            { id: `use-${Date.now()}`, role: 'assistant', text: '', at: Date.now(), usage: e.usage }
          ])
          set({ testUsage: { ...get().testUsage, [slug]: addUsage(get().testUsage[slug], e.usage) } })
        }
        break
    }
  }
})
