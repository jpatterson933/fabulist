import type { StateCreator } from 'zustand'
import type { AgentEvent, AgentStatus, ArchivedTest, ChatItem, PermissionRequest, RunUsage } from '@shared/types'
import type { SkillStudioSlice, Store, UsageTotals } from './types'
import { findEditSpan, nextSeq } from './shared'
import { formatTestTranscript } from '@/lib/transcript'
import { buildProposed } from '@/lib/suggest'

/** Frames a referenced test transcript for the authoring agent. */
const TEST_REF_PREAMBLE =
  'The user is referencing a recent TEST RUN of this skill — a transcript of the skill ' +
  'being run in a sandbox as a real user would invoke it. Use it to diagnose the behavior ' +
  'and propose changes to the skill’s files. The transcript:'

// The Plugin Studio slice — owns the `mode` switch, the authored-skill list + file
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

/** The width the sidebar loads at, and the target of double-click-to-reset. */
export const DEFAULT_SIDEBAR = 380

/** Insert-or-replace an assistant item in a transcript by id (pure). */
function upsertAssistantItem(
  items: ChatItem[],
  itemId: string,
  fn: (item: ChatItem) => ChatItem
): ChatItem[] {
  const idx = items.findIndex((i) => i.id === itemId)
  if (idx === -1) {
    return [...items, fn({ id: itemId, role: 'assistant', text: '', at: Date.now(), toolNotes: [] })]
  }
  const next = [...items]
  next[idx] = fn(next[idx])
  return next
}

/**
 * Everything one studio stream (authoring or test) reads/writes — supplied as concrete
 * accessors so the shared reducer below stays type-safe (no computed-key casts) and the
 * authoring vs. test differences live in exactly one place each.
 */
interface StudioEventTarget {
  getChats: () => Record<string, ChatItem[]>
  setChats: (next: Record<string, ChatItem[]>) => void
  setStatus: (slug: string, status: AgentStatus) => void
  getPermissions: () => Record<string, PermissionRequest[]>
  setPermissions: (next: Record<string, PermissionRequest[]>) => void
  /** reveal the tab where a pending permission card lives (chat for authoring, test for test) */
  focusTab: () => void
  accumulateUsage: (slug: string, usage: RunUsage) => void
  /** persist the transcript so it survives a restart */
  persist: (slug: string, chat: ChatItem[]) => void
  /** extra side-effects when a run finishes (authoring refreshes the edited files) */
  onResult?: (slug: string) => void
  /** apply an edit to the open buffer the instant it's approved/auto-applied (authoring only) */
  applyEdit?: (slug: string, request: PermissionRequest) => void
}

/**
 * The shared reducer for both studio streams. The authoring and test transcripts behave
 * identically except for which store fields they touch (the target), the permission tab,
 * and a couple of authoring-only steps — so the event handling lives here once, and a new
 * event kind is wired in for both threads at the same time. (`edit-applied` only fires for
 * the authoring stream; including it here is harmless — the test stream never emits it.)
 */
function makeStudioEventReducer(t: StudioEventTarget): (e: AgentEvent) => void {
  return (e) => {
    const slug = e.docId
    const updateChat = (fn: (items: ChatItem[]) => ChatItem[]): void =>
      t.setChats({ ...t.getChats(), [slug]: fn(t.getChats()[slug] ?? []) })
    const upsertAssistant = (itemId: string, fn: (item: ChatItem) => ChatItem): void =>
      updateChat((items) => upsertAssistantItem(items, itemId, fn))

    switch (e.kind) {
      case 'status':
        t.setStatus(slug, e.status)
        break
      case 'user-echo':
        updateChat((items) => [
          ...items,
          { id: e.itemId, role: 'user', text: e.text, quote: e.quote, at: Date.now() }
        ])
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
        // land the change in the editor at once (the card already carries the new
        // text) instead of waiting for the whole turn to finish and re-read disk
        t.applyEdit?.(slug, e.request)
        break
      case 'permission-request': {
        const cur = t.getPermissions()[slug] ?? []
        if (cur.some((p) => p.requestId === e.request.requestId)) break
        t.focusTab()
        t.setPermissions({ ...t.getPermissions(), [slug]: [...cur, e.request] })
        break
      }
      case 'permission-resolved':
        t.setPermissions({
          ...t.getPermissions(),
          [slug]: (t.getPermissions()[slug] ?? []).filter((p) => p.requestId !== e.requestId)
        })
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
          t.accumulateUsage(slug, e.usage)
        }
        t.onResult?.(slug)
        const saved = t.getChats()[slug]
        if (saved) t.persist(slug, saved)
        break
      }
    }
  }
}

export const createSkillStudioSlice: StateCreator<Store, [], [], SkillStudioSlice> = (set, get) => ({
  mode: 'doc',
  studioRailOpen: true,
  studioFilesOpen: true,
  studioSidebarWidth: DEFAULT_SIDEBAR,
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
  studioAutoApprove: false,
  studioModel: '',
  authPermissions: {},
  testPermissions: {},
  testVersion: {},
  archivedTests: {},
  studioRevealPos: null,

  openStudio: async () => {
    set({ mode: 'skillStudio' })
    await get().loadStudioSkills()
  },

  closeStudio: () => {
    void get().flushStudioFile()
    set({ mode: 'doc' })
  },

  toggleStudioRail: () => set({ studioRailOpen: !get().studioRailOpen }),

  toggleStudioFiles: () => set({ studioFilesOpen: !get().studioFilesOpen }),

  setStudioSidebarWidth: (w) => set({ studioSidebarWidth: Math.round(w) }),

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
    // load this skill's persisted model + auto-apply (mirrors the doc app's loadSettings)
    const settings = await window.fabulist.skillStudio
      .getSettings(slug)
      .catch(() => ({ model: '', autoApprove: false }))
    set({ studioModel: settings.model, studioAutoApprove: settings.autoApprove })
    await get().loadStudioFiles(slug)
    // Restore persisted transcripts the first time a skill is opened this session, so
    // they survive an app restart. Re-opening keeps the in-memory threads (which may
    // hold a live background run) rather than clobbering them with the last-saved copy.
    if (get().authChats[slug] === undefined || get().testChats[slug] === undefined) {
      const { authChat, testChat, testVersion, archivedTests } = await window.fabulist.skillStudio
        .readChats(slug)
        .catch(() => ({ authChat: [], testChat: [], testVersion: 1, archivedTests: [] }))
      const cur = get()
      set({
        authChats: cur.authChats[slug] === undefined ? { ...cur.authChats, [slug]: authChat } : cur.authChats,
        testChats: cur.testChats[slug] === undefined ? { ...cur.testChats, [slug]: testChat } : cur.testChats,
        testVersion: { ...cur.testVersion, [slug]: testVersion },
        archivedTests: { ...cur.archivedTests, [slug]: archivedTests }
      })
    }
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
      // drop any prior "Show in file" highlight so it can't bleed onto the file we're
      // opening (revealStudioEdit sets a fresh one right after, for the right file)
      set({ openFilePath: rel, fileContent: content, fileDirty: false, studioRevealPos: null })
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

  authSend: async (prompt, opts = {}) => {
    const slug = get().activeSkill
    if (!slug || !prompt.trim()) return
    set({ studioTab: 'chat' })
    // make sure the user's latest edits are on disk before Claude reads the files
    await get().flushStudioFile()
    const text = prompt.trim()

    // weave a test thread's transcript into the prompt (but not the chat echo) when the
    // user referenced one via "/": 'current' = the live run, { version } = an archived
    // run. The bubble shows their note plus a short marker; Claude receives the full run.
    let fullPrompt = text
    let display: { echo: string; quote?: string } | undefined
    if (opts.testRef) {
      const ref = opts.testRef // const so the narrowing holds inside the closure below
      const archived =
        ref !== 'current'
          ? (get().archivedTests[slug] ?? []).find((a) => a.version === ref.version)
          : undefined
      const items = ref === 'current' ? (get().testChats[slug] ?? []) : (archived?.chat ?? [])
      const label = ref === 'current' ? 'the latest test run' : `test v${archived?.version ?? ''}`
      const transcript = formatTestTranscript(items)
      if (transcript) {
        fullPrompt = `${TEST_REF_PREAMBLE}\n\n<test-run>\n${transcript}\n</test-run>\n\n${text}`
        const count = items.filter((i) => !i.usage).length
        display = { echo: text, quote: `Referenced ${label} (${count} message${count === 1 ? '' : 's'})` }
      }
    }

    // auto-apply is read from the skill's persisted settings by main (mirrors the doc app),
    // so it isn't passed here — toggling it even mid-run is honored by the gate
    await window.fabulist.skillStudio
      .authSend(slug, fullPrompt, display)
      .catch((e) => get().reportError(e, 'Couldn’t reach Claude'))
  },

  interruptAuth: () => {
    const slug = get().activeSkill
    if (slug) void window.fabulist.skillStudio.authInterrupt(slug)
  },

  resetAuth: async () => {
    const slug = get().activeSkill
    if (!slug) return
    // main rotates the SDK resume session AND clears the persisted transcript + resume id,
    // so the next message is a genuinely fresh conversation — the skill's files are untouched
    await window.fabulist.skillStudio.resetAuth(slug).catch(() => {})
    const authUsage = { ...get().authUsage }
    delete authUsage[slug]
    set({
      authChats: { ...get().authChats, [slug]: [] },
      authAgent: { ...get().authAgent, [slug]: 'idle' },
      authPermissions: { ...get().authPermissions, [slug]: [] },
      authUsage
    })
  },

  setStudioAutoApprove: (on) => {
    set({ studioAutoApprove: on })
    const slug = get().activeSkill
    if (slug) window.fabulist.skillStudio.setSetting(slug, 'autoApprove', on).catch(() => {})
  },

  setStudioModel: (model) => {
    const slug = get().activeSkill
    if (!slug) return
    set({ studioModel: model })
    window.fabulist.skillStudio.setSetting(slug, 'model', model).catch(() => {})
  },

  respondStudioPermission: (requestId, approved, answers) => {
    window.fabulist.skillStudio.respondPermission(requestId, approved, answers)
  },

  revealStudioEdit: async (edit) => {
    const slug = get().activeSkill
    if (!slug || !edit.filePath) return
    get().setStudioTab('chat')
    // open the edited file if it isn't already the one in the editor
    if (get().openFilePath !== edit.filePath) {
      await get().openStudioFile(edit.filePath)
      // a skill/file switch during the async open invalidates this reveal — bail
      // rather than highlight a stale span in whatever file is now showing
      if (get().activeSkill !== slug || get().openFilePath !== edit.filePath) return
    }
    // find where the edit landed in the current buffer (same best-effort search as the
    // document chat); the edit's own offsets would be stale
    const span = findEditSpan(get().fileContent, edit)
    if (span) set({ studioRevealPos: { ...span, seq: nextSeq() } })
  },

  handleAuthEvent: makeStudioEventReducer({
    getChats: () => get().authChats,
    setChats: (m) => set({ authChats: m }),
    setStatus: (slug, status) => set({ authAgent: { ...get().authAgent, [slug]: status } }),
    getPermissions: () => get().authPermissions,
    setPermissions: (m) => set({ authPermissions: m }),
    focusTab: () => set({ studioTab: 'chat' }),
    accumulateUsage: (slug, usage) =>
      set({ authUsage: { ...get().authUsage, [slug]: addUsage(get().authUsage[slug], usage) } }),
    persist: (slug, chat) => void window.fabulist.skillStudio.saveAuthChat(slug, chat).catch(() => {}),
    // Optimistic apply: an approved (or auto-applied) edit lands in the open buffer the
    // instant the edit-applied event fires, instead of only when the whole turn ends and
    // onResult re-reads disk. The card already carries the new text, so we rebuild the
    // proposed content the same way the inline suggestion does. onResult stays as the
    // backstop that reconciles against disk. Skip if the file isn't open or has unsaved edits.
    applyEdit: (slug, request) => {
      if (get().activeSkill !== slug) return
      if (request.filePath !== get().openFilePath || get().fileDirty) return
      const proposed = buildProposed(get().fileContent, request)
      if (proposed !== null) set({ fileContent: proposed })
    },
    // Claude may have edited the skill's files — refresh the tree + open file (without
    // clobbering unsaved local edits)
    onResult: (slug) => {
      if (get().activeSkill !== slug) return
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
  }),

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

  testSkill: async (prompt, opts = {}) => {
    const slug = get().activeSkill
    if (!slug || !prompt.trim()) return
    // make sure the latest SKILL.md is on disk before the plugin is loaded for the test
    await get().flushStudioFile()
    const task = prompt.trim()

    // picking a skill via "/" invokes it explicitly: the model gets a "use the <name>
    // skill" directive (the natural-language equivalent of how a user calls it), while
    // the chat shows just the task plus a short marker. The skill itself decides what to read.
    let fullPrompt = task
    let display: { echo: string; quote?: string } | undefined
    if (opts.skill) {
      fullPrompt = `Use the "${opts.skill}" skill for this:\n\n${task}`
      display = { echo: task, quote: `Using the ${opts.skill} skill` }
    }

    await window.fabulist.skillStudio.test(slug, fullPrompt, display).catch((e) =>
      get().reportError(e, 'The test run failed to start')
    )
  },

  resetTest: async () => {
    const slug = get().activeSkill
    if (!slug) return
    await window.fabulist.skillStudio.resetTest(slug).catch(() => {})
    // a fresh thread also clears the persisted transcript, so the reset survives a restart
    window.fabulist.skillStudio.saveTestChat(slug, []).catch(() => {})
    const testUsage = { ...get().testUsage }
    delete testUsage[slug]
    set({
      testChats: { ...get().testChats, [slug]: [] },
      testAgent: { ...get().testAgent, [slug]: 'idle' },
      testPermissions: { ...get().testPermissions, [slug]: [] },
      testUsage
    })
  },

  archiveAndResetTest: async () => {
    const slug = get().activeSkill
    if (!slug) return
    const chat = get().testChats[slug] ?? []
    if (chat.length === 0) return get().resetTest() // nothing to archive — just clear
    try {
      // main archives the transcript under its version, bumps the version, clears the
      // persisted live thread; then drop the (unresumable) session + sandbox
      const { version, at, nextVersion } = await window.fabulist.skillStudio.archiveTest(slug, chat)
      await window.fabulist.skillStudio.resetTest(slug).catch(() => {})
      // main now archives the full transcript on disk, so mirror it whole in-session
      const entry: ArchivedTest = { version, at, chat }
      const testUsage = { ...get().testUsage }
      delete testUsage[slug]
      set({
        archivedTests: { ...get().archivedTests, [slug]: [entry, ...(get().archivedTests[slug] ?? [])] },
        testVersion: { ...get().testVersion, [slug]: nextVersion },
        testChats: { ...get().testChats, [slug]: [] },
        testAgent: { ...get().testAgent, [slug]: 'idle' },
        testPermissions: { ...get().testPermissions, [slug]: [] },
        testUsage
      })
    } catch (e) {
      get().reportError(e, 'Couldn’t archive the test')
    }
  },

  interruptTest: () => {
    const slug = get().activeSkill
    if (slug) void window.fabulist.skillStudio.interruptTest(slug)
  },

  handleStudioEvent: makeStudioEventReducer({
    getChats: () => get().testChats,
    setChats: (m) => set({ testChats: m }),
    setStatus: (slug, status) => set({ testAgent: { ...get().testAgent, [slug]: status } }),
    getPermissions: () => get().testPermissions,
    setPermissions: (m) => set({ testPermissions: m }),
    // surface a test-run question on the Test tab so it's never stranded on a hidden tab
    focusTab: () => set({ studioTab: 'test' }),
    accumulateUsage: (slug, usage) =>
      set({ testUsage: { ...get().testUsage, [slug]: addUsage(get().testUsage[slug], usage) } }),
    persist: (slug, chat) => void window.fabulist.skillStudio.saveTestChat(slug, chat).catch(() => {})
  })
})
