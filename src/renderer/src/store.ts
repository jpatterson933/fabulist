import { create } from 'zustand'
import {
  DEFAULT_MODEL_CHOICE,
  FALLBACK_MODEL_CHOICES,
  type AgentEvent,
  type AgentThread,
  type Attachment,
  type ChatItem,
  type CommandEvent,
  type CommandRunState,
  type CommentAnchor,
  type CommentThread,
  type CommitInfo,
  type FileMeta,
  type ModelChoice,
  type PermissionRequest,
  type ProjectEvent,
  type ProjectMeta
} from '@shared/types'
import type { ActionDef, Harness } from '@shared/harness'
import { isTextFile } from '@shared/fileFormats'
import { locateAnchor } from './lib/anchors'
import { SURFACES } from './lib/surfaces'

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

export interface FabulistStore {
  projects: ProjectMeta[]
  activeProjectId: string | null
  /** files of the active project */
  files: FileMeta[]
  /** folders of the active project (project-relative paths), empty ones included */
  folders: string[]
  /** open tab filenames for the active project */
  openDocs: string[]
  /** active tab filename */
  activeFile: string | null
  /** cached content of open tabs, keyed by file filename */
  fileContents: Record<string, string>
  /** the active file's live content (the editor binds to this) */
  content: string
  external: ExternalUpdate | null
  /** comment threads for the active file */
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
  /** what the left rail shows: the project list, or the active project's files */
  railView: 'projects' | 'files'
  sidebarOpen: boolean
  libraryOpen: boolean
  commits: CommitInfo[]
  preview: { hash: string; content: string; subject: string } | null
  model: string
  models: ModelChoice[]
  draftComment: DraftComment | null
  activeThreadId: string | null
  inlineSuggestionId: string | null
  pendingCommentId: string | null
  queuedCommentSends: { commentId: string; prompt: string; quote: string }[]
  scrollTo: { threadId: string; seq: number } | null
  autoApprove: boolean
  /** the active project's studio harness (fabulist.json + skills), if loaded */
  harness: Harness | null
  /**
   * harness panels open as tabs, like files; ids into harness.config.panels,
   * or "command:<id>" for a studio command's log/preview tab
   */
  openPanels: string[]
  /** the focused panel tab; when set it shows instead of the active file */
  activePanel: string | null
  /** live run state of the active project's studio commands, keyed by command id */
  commandRuns: Record<string, CommandRunState>
  paletteOpen: boolean
  /** the new-file dialog (title + file type) */
  newFileOpen: boolean
  /** the new-project chooser (blank / genesis / starter studios) */
  newProjectOpen: boolean
  /** current editor selection, for selection-surface actions */
  selectionQuote: string | null

  loadHarness: () => Promise<void>
  trustStudio: (trusted: boolean) => Promise<void>
  /** quote overrides the tracked editor selection (used by the selection toolbar) */
  runAction: (action: ActionDef, quote?: string) => void
  openPanel: (panelId: string) => void
  closePanel: (panelId: string) => void
  /** start a studio command (user-initiated; also opens its log tab) */
  runCommand: (commandId: string) => Promise<void>
  stopCommand: (commandId: string) => Promise<void>
  handleCommandEvent: (event: CommandEvent) => void
  setPaletteOpen: (open: boolean) => void
  setNewFileOpen: (open: boolean) => void
  setNewProjectOpen: (open: boolean) => void
  /** instantiate a built-in starter studio as a new project */
  createProjectFromTemplate: (templateId: string, title: string) => Promise<void>
  /** instantiate the open template project as a new project */
  createProjectFromCurrent: (title: string) => Promise<void>
  /** genesis: blank project that opens straight into the workshop */
  createProjectWithWorkshop: (title: string) => Promise<void>
  setSelectionQuote: (quote: string | null) => void
  openWorkshop: () => Promise<void>

  loadProjects: () => Promise<void>
  createProject: (title: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  openProject: (id: string) => Promise<void>
  closeProject: () => Promise<void>

  loadFiles: () => Promise<void>
  createFile: (title: string, typeId?: string) => Promise<void>
  /** create a file at an exact project-relative path (tree inline create) and open it */
  createFileAt: (file: string) => Promise<void>
  createFolder: (folder: string) => Promise<void>
  deleteFile: (file: string) => Promise<void>
  deleteFolder: (folder: string) => Promise<void>
  /** move or rename a file or folder; open tabs and the active file follow */
  renamePath: (from: string, to: string) => Promise<void>
  openTab: (file: string) => Promise<void>
  closeTab: (file: string) => Promise<void>
  setActiveFile: (file: string) => Promise<void>

  setContent: (content: string) => void
  /** programmatic edit (frontmatter form): updates the store AND the open editor */
  replaceContent: (content: string) => void
  flushWrite: () => Promise<void>
  snapshot: (label?: string) => Promise<void>

  setTab: (tab: SidebarTab) => void
  setRailView: (view: 'projects' | 'files') => void
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
  interrupt: () => void
  respondPermission: (requestId: string, approved: boolean) => void
  setInlineSuggestion: (requestId: string | null) => void
  setAutoApprove: (on: boolean) => void

  loadHistory: () => Promise<void>
  openPreview: (commit: CommitInfo) => Promise<void>
  closePreview: () => void
  restorePreview: () => Promise<void>

  handleAgentEvent: (e: AgentEvent) => void
  /** everything the main process observes on the project folder, one dispatcher */
  handleProjectEvent: (e: ProjectEvent) => void
  handleExternalChange: (projectId: string, file: string, content: string) => void
  /** a file file was deleted outside the app (terminal, agent, teammate's pull) */
  handleFileRemoved: (projectId: string, file: string) => void
}

// per-(project,file) debounce timers, so a tab switch flushes the right file
let writeTimer: ReturnType<typeof setTimeout> | null = null
let writeTarget: { projectId: string; file: string } | null = null
let idleCommitTimer: ReturnType<typeof setTimeout> | null = null
let anchorTimer: ReturnType<typeof setTimeout> | null = null
let extSeq = 1

// panel tabs persist alongside file tabs in project.json's openTabs, prefixed
// so a plain filename can never collide with a panel id
const PANEL_TAB = 'panel:'
/** panel-slot ids for a command's log/preview tab: "command:<commandId>" */
export const COMMAND_PANEL = 'command:'
/** is this panel-slot id valid against the current harness? */
const panelIdValid = (harness: Harness | null, id: string): boolean => {
  if (!harness) return false
  if (id.startsWith(COMMAND_PANEL)) {
    return harness.config.commands.some((c) => COMMAND_PANEL + c.id === id)
  }
  return harness.config.panels.some((p) => p.id === id)
}
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
  files: [],
  folders: [],
  openDocs: [],
  activeFile: null,
  fileContents: {},
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
  commandRuns: {},
  paletteOpen: false,
  newFileOpen: false,
  newProjectOpen: false,
  selectionQuote: null,

  loadHarness: async () => {
    const id = get().activeProjectId
    if (!id) return
    const harness = await window.fabulist.harness.load(id)
    // drop tabs for panels whose definition disappeared out from under us
    const openPanels = get().openPanels.filter((p) => panelIdValid(harness, p))
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
    const surface = SURFACES[action.surface]
    if (!surface.available(get(), quoteOverride)) return
    const quote = surface.quote(get(), quoteOverride)
    const parts: string[] = []
    if (action.skill) {
      parts.push(`Invoke your "${action.skill}" skill (use the Skill tool) and follow it.`)
    }
    if (action.prompt) parts.push(action.prompt)
    if (surface.framing) parts.push(surface.framing)
    set({ paletteOpen: false })
    get().askClaude(parts.join('\n\n'), quote ? { quote } : {})
  },

  openPanel: (panelId) => {
    const id = get().activeProjectId
    if (!id || !panelIdValid(get().harness, panelId)) return
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
    // closing the focused panel falls back to the remaining tabs: last panel, else the active file
    const activePanel =
      get().activePanel === panelId ? openPanels[openPanels.length - 1] ?? null : get().activePanel
    set({ openPanels, activePanel })
    void window.fabulist.project.setOpenTabs(id, combinedTabs(get().openDocs, openPanels))
  },

  runCommand: async (commandId) => {
    const id = get().activeProjectId
    if (!id) return
    get().openPanel(COMMAND_PANEL + commandId)
    try {
      await window.fabulist.commands.start(id, commandId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const prev = get().commandRuns[commandId]
      set({
        commandRuns: {
          ...get().commandRuns,
          [commandId]: { running: false, log: `${prev?.log ?? ''}\n[fabulist] ${msg}\n`, exitCode: null }
        }
      })
    }
  },

  stopCommand: async (commandId) => {
    const id = get().activeProjectId
    if (!id) return
    await window.fabulist.commands.stop(id, commandId)
  },

  handleCommandEvent: (event) => {
    if (event.projectId !== get().activeProjectId) return
    const prev = get().commandRuns[event.commandId] ?? { running: false, log: '' }
    let next: CommandRunState = prev
    if (event.kind === 'command-started') {
      next = { running: true, startedAt: Date.now(), log: '' }
    } else if (event.kind === 'command-output') {
      next = { ...prev, log: (prev.log + event.chunk).slice(-200_000) }
    } else if (event.kind === 'command-exited') {
      next = { ...prev, running: false, exitCode: event.code }
    }
    set({ commandRuns: { ...get().commandRuns, [event.commandId]: next } })
  },

  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setNewFileOpen: (open) => set({ newFileOpen: open }),
  setNewProjectOpen: (open) => set({ newProjectOpen: open }),

  createProjectFromTemplate: async (templateId, title) => {
    const id = await window.fabulist.templates.create(templateId, title)
    await get().loadProjects()
    await get().openProject(id)
  },

  createProjectFromCurrent: async (title) => {
    const src = get().activeProjectId
    if (!src) return
    const id = await window.fabulist.templates.createFromProject(src, title)
    await get().loadProjects()
    await get().openProject(id)
  },

  createProjectWithWorkshop: async (title) => {
    await get().createProject(title)
    await get().openWorkshop()
  },
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

    const [files, folders, meta, agentThreads, activeThreadId, commits, model, harness] = await Promise.all([
      window.fabulist.project.files(id),
      window.fabulist.project.folders(id),
      window.fabulist.project.meta(id),
      window.fabulist.agent.threads(id),
      window.fabulist.agent.activeThread(id),
      window.fabulist.history.log(id),
      window.fabulist.project.getModel(id),
      window.fabulist.harness.load(id)
    ])

    const present = new Set(files.map((d) => d.file))
    // the studio's layout may say whether the chat sidebar starts open
    const layoutSidebar = harness?.config.layout.sidebar
    let openDocs = meta.openTabs.filter((f) => !f.startsWith(PANEL_TAB) && present.has(f))
    const openPanels = meta.openTabs
      .filter((f) => f.startsWith(PANEL_TAB))
      .map((f) => f.slice(PANEL_TAB.length))
      .filter((p) => panelIdValid(harness, p))
    const commandRuns = await window.fabulist.commands.status(id).catch(() => ({}))
    if (openDocs.length === 0 && files.length > 0) openDocs = [files[0].file]
    const activeFile =
      meta.activeFile && openDocs.includes(meta.activeFile)
        ? meta.activeFile
        : openDocs[0] ?? null
    // a panels-only layout (no persisted active file) opens focused on its panel
    const activePanel = !meta.activeFile && openPanels.length > 0 ? openPanels[0] : null

    let content = ''
    let threads: CommentThread[] = []
    if (activeFile) {
      const [c, rawThreads] = await Promise.all([
        window.fabulist.file.read(id, activeFile),
        window.fabulist.comments.list(id, activeFile)
      ])
      content = c
      threads = reanchor(rawThreads, c)
    }
    const chat = activeThreadId ? await window.fabulist.agent.threadChat(id, activeThreadId) : []

    set({
      activeProjectId: id,
      railView: 'files',
      files,
      folders,
      openDocs,
      activeFile,
      fileContents: activeFile ? { [activeFile]: content } : {},
      content,
      external: { seq: extSeq++, content },
      threads,
      commits,
      model,
      preview: null,
      draftComment: null,
      activeThreadId: null,
      permissions: [],
      inlineSuggestionId: null,
      pendingCommentId: null,
      queuedCommentSends: [],
      harness,
      openPanels,
      activePanel,
      commandRuns,
      paletteOpen: false,
      newFileOpen: false,
      selectionQuote: null,
      ...(layoutSidebar ? { sidebarOpen: layoutSidebar === 'open' } : {}),
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
    await window.fabulist.project.snapshot(id, 'Edited').catch(() => {})
    await window.fabulist.project.watch(null)
    set({
      activeProjectId: null,
      railView: 'projects',
      files: [],
      folders: [],
      openDocs: [],
      activeFile: null,
      fileContents: {},
      content: '',
      threads: [],
      commits: [],
      preview: null,
      harness: null,
      openPanels: [],
      activePanel: null,
      commandRuns: {},
      paletteOpen: false,
      newFileOpen: false,
      selectionQuote: null
    })
  },

  loadFiles: async () => {
    const id = get().activeProjectId
    if (!id) return
    const [files, folders] = await Promise.all([
      window.fabulist.project.files(id),
      window.fabulist.project.folders(id)
    ])
    if (get().activeProjectId !== id) return
    set({ files, folders })
  },

  createFile: async (title, typeId) => {
    const id = get().activeProjectId
    if (!id) return
    const meta = await window.fabulist.project.createFile(id, title, typeId)
    await get().loadFiles()
    // add the tab but let setActiveFile read the seeded file from disk (which also
    // primes the watcher's echo-suppression so the create write doesn't bounce back)
    set({ openDocs: [...get().openDocs.filter((f) => f !== meta.file), meta.file] })
    await get().setActiveFile(meta.file)
    await get().loadProjects()
  },

  createFileAt: async (file) => {
    const id = get().activeProjectId
    if (!id) return
    const meta = await window.fabulist.project.createFileAt(id, file)
    await get().loadFiles()
    await get().openTab(meta.file)
    await get().loadProjects()
  },

  createFolder: async (folder) => {
    const id = get().activeProjectId
    if (!id) return
    await window.fabulist.project.createFolder(id, folder)
    await get().loadFiles()
  },

  renamePath: async (from, to) => {
    const id = get().activeProjectId
    if (!id) return
    // the pending write (if any) must land at the old path before it moves
    await get().flushWrite()
    await window.fabulist.project.renamePath(id, from, to)
    const remap = (f: string): string =>
      f === from ? to : f.startsWith(`${from}/`) ? `${to}${f.slice(from.length)}` : f
    const fileContents = Object.fromEntries(
      Object.entries(get().fileContents).map(([k, v]) => [remap(k), v])
    )
    const active = get().activeFile
    set({
      openDocs: get().openDocs.map(remap),
      fileContents,
      activeFile: active ? remap(active) : null
    })
    await get().loadFiles()
    await get().loadProjects()
  },

  deleteFolder: async (folder) => {
    const id = get().activeProjectId
    if (!id) return
    await window.fabulist.project.deleteFolder(id, folder)
    const under = (f: string): boolean => f === folder || f.startsWith(`${folder}/`)
    const openDocs = get().openDocs.filter((f) => !under(f))
    const fileContents = Object.fromEntries(
      Object.entries(get().fileContents).filter(([k]) => !under(k))
    )
    set({ openDocs, fileContents })
    const active = get().activeFile
    if (active && under(active)) {
      const next = openDocs[openDocs.length - 1] ?? null
      if (next) await get().setActiveFile(next)
      else set({ activeFile: null, content: '', threads: [], external: { seq: extSeq++, content: '' } })
    }
    await get().loadFiles()
    await get().loadProjects()
  },

  deleteFile: async (file) => {
    const id = get().activeProjectId
    if (!id) return
    await window.fabulist.project.deleteFile(id, file)
    const openDocs = get().openDocs.filter((f) => f !== file)
    const { [file]: _gone, ...fileContents } = get().fileContents
    set({ openDocs, fileContents })
    if (get().activeFile === file) {
      const next = openDocs[openDocs.length - 1] ?? null
      if (next) await get().setActiveFile(next)
      else set({ activeFile: null, content: '', threads: [], external: { seq: extSeq++, content: '' } })
    }
    await get().loadFiles()
    await get().loadProjects()
  },

  openTab: async (file) => {
    if (!get().openDocs.includes(file)) {
      const openDocs = [...get().openDocs, file]
      set({ openDocs })
      const id = get().activeProjectId
      if (id) void window.fabulist.project.setOpenTabs(id, combinedTabs(openDocs, get().openPanels))
    }
    await get().setActiveFile(file)
  },

  closeTab: async (file) => {
    const id = get().activeProjectId
    if (!id) return
    // flush the file being closed if it's the live one
    if (get().activeFile === file) await get().flushWrite()
    const openDocs = get().openDocs.filter((f) => f !== file)
    const { [file]: _gone, ...fileContents } = get().fileContents
    set({ openDocs, fileContents })
    void window.fabulist.project.setOpenTabs(id, combinedTabs(openDocs, get().openPanels))
    if (get().activeFile === file) {
      const next = openDocs[openDocs.length - 1] ?? null
      if (next) await get().setActiveFile(next)
      else {
        set({ activeFile: null, content: '', threads: [], external: { seq: extSeq++, content: '' } })
        void window.fabulist.project.setActiveFile(id, null)
      }
    }
  },

  setActiveFile: async (file) => {
    const id = get().activeProjectId
    // selecting a file always leaves any open harness panel
    if (get().activePanel) set({ activePanel: null })
    if (!id || get().activeFile === file) return
    // stash the outgoing file's live content and flush its pending write
    const prevDoc = get().activeFile
    if (prevDoc) {
      set({ fileContents: { ...get().fileContents, [prevDoc]: get().content } })
      await get().flushWrite()
    }
    // non-text files (images) have no editable content — their views load by URL
    const cached = get().fileContents[file]
    const content = isTextFile(file)
      ? cached ?? (await window.fabulist.file.read(id, file))
      : ''
    const rawThreads = await window.fabulist.comments.list(id, file)
    set({
      activeFile: file,
      content,
      fileContents: { ...get().fileContents, [file]: content },
      external: { seq: extSeq++, content },
      threads: reanchor(rawThreads, content),
      preview: null,
      draftComment: null,
      activeThreadId: null,
      inlineSuggestionId: null
    })
    void window.fabulist.project.setActiveFile(id, file)
  },

  setContent: (content) => {
    const id = get().activeProjectId
    const file = get().activeFile
    if (!id || !file) return
    set({ content, fileContents: { ...get().fileContents, [file]: content } })
    writeTarget = { projectId: id, file }
    if (writeTimer) clearTimeout(writeTimer)
    writeTimer = setTimeout(async () => {
      writeTimer = null
      await window.fabulist.file.write(id, file, get().content).catch(() => {})
      get().loadFiles()
      get().loadProjects()
    }, 400)
    if (idleCommitTimer) clearTimeout(idleCommitTimer)
    idleCommitTimer = setTimeout(async () => {
      idleCommitTimer = null
      if (get().activeProjectId !== id) return
      await get().flushWrite()
      const committed = await window.fabulist.project.snapshot(id, 'Edited').catch(() => false)
      if (committed) get().loadHistory()
    }, 60_000)
  },

  replaceContent: (content) => {
    if (!get().activeFile) return
    // setContent stores it and schedules the debounced write; the external
    // bump pushes it into the CodeMirror view, which re-anchors by quote
    get().setContent(content)
    set({ external: { seq: extSeq++, content }, threads: reanchor(get().threads, content) })
  },

  flushWrite: async () => {
    if (!writeTimer || !writeTarget) return
    const { projectId, file } = writeTarget
    clearTimeout(writeTimer)
    writeTimer = null
    const content = get().fileContents[file] ?? get().content
    await window.fabulist.file.write(projectId, file, content).catch(() => {})
    get().loadFiles()
    get().loadProjects()
  },

  snapshot: async (label) => {
    const id = get().activeProjectId
    if (!id) return
    await get().flushWrite()
    await window.fabulist.project.snapshot(id, label)
    await get().loadHistory()
  },

  setTab: (tab) => set({ tab, sidebarOpen: true }),
  setRailView: (railView) => set({ railView }),
  toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
  toggleLibrary: () => set({ libraryOpen: !get().libraryOpen }),

  reloadThreads: async () => {
    const id = get().activeProjectId
    const file = get().activeFile
    if (!id || !file) return
    const raw = await window.fabulist.comments.list(id, file)
    set({ threads: reanchor(raw, get().content) })
  },

  persistAnchors: (anchors) => {
    const id = get().activeProjectId
    const file = get().activeFile
    if (!id || !file) return
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
          file,
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
    const file = get().activeFile
    const draft = get().draftComment
    if (!id || !file || !draft || !text.trim()) return
    const thread = await window.fabulist.comments.add(id, file, draft.anchor, text.trim())
    set({ draftComment: null, activeThreadId: thread.id })
    await get().reloadThreads()
    get().engageClaudeOnThread(thread)
  },

  replyToThread: async (threadId, text) => {
    const id = get().activeProjectId
    const file = get().activeFile
    if (!id || !file || !text.trim()) return
    const thread = await window.fabulist.comments.reply(id, file, threadId, text.trim())
    await get().reloadThreads()
    if (thread) get().engageClaudeOnThread(thread)
  },

  engageClaudeOnThread: (thread) => {
    const id = get().activeProjectId
    if (!id) return
    const prompt =
      thread.messages.length === 1
        ? thread.messages[0].text
        : 'Comment thread on the quoted text:\n\n' +
          thread.messages
            .map((m) => `${m.author === 'you' ? 'User' : 'Claude'}: ${m.text}`)
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
    const file = get().activeFile
    if (!id || !file) return
    await window.fabulist.comments.setStatus(id, file, threadId, status)
    await get().reloadThreads()
  },

  removeThread: async (threadId) => {
    const id = get().activeProjectId
    const file = get().activeFile
    if (!id || !file) return
    await window.fabulist.comments.remove(id, file, threadId)
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
      file: get().activeFile ?? undefined
    })
  },

  setModel: (model) => {
    const id = get().activeProjectId
    if (!id) return
    set({ model })
    window.fabulist.project.setModel(id, model).catch(() => {})
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
    const file = get().activeFile
    if (!id || !file) return
    const content = await window.fabulist.history.show(id, file, commit.hash)
    set({ preview: { hash: commit.hash, content, subject: commit.subject } })
  },

  closePreview: () => set({ preview: null }),

  restorePreview: async () => {
    const id = get().activeProjectId
    const file = get().activeFile
    const preview = get().preview
    if (!id || !file || !preview) return
    await get().flushWrite()
    const content = await window.fabulist.history.restore(id, file, preview.hash)
    set({
      preview: null,
      content,
      fileContents: { ...get().fileContents, [file]: content },
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
        // auto-accept file edits when the user has opted in — Bash commands
        // (carried as request.command) always prompt, no matter the setting
        if (get().autoApprove && !e.request.command) {
          get().respondPermission(e.request.requestId, true)
          break
        }
        if (
          e.projectId === activeProjectId &&
          !get().permissions.some((p) => p.requestId === e.request.requestId)
        ) {
          // an edit to the focused file renders inline in the editor; everything
          // else (other files, Bash) shows as a card in the chat tab
          const inline = e.request.filePath === get().activeFile
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
          get().loadFiles()
          get().loadProjects()
          get().loadAgentThreads()
          // reload comments if the reply landed on the focused file
          if (e.commentId && e.file === get().activeFile) get().reloadThreads()
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

  handleProjectEvent: (e) => {
    if (get().activeProjectId !== e.projectId) return
    switch (e.kind) {
      case 'harness-changed':
        void get().loadHarness()
        void get().loadFiles() // file kinds/titles may derive from the manifest
        break
      case 'file-external-change':
        get().handleExternalChange(e.projectId, e.file, e.content)
        break
      case 'file-touched':
        void get().loadFiles() // non-text views (images) reload by URL off the file list
        break
      case 'file-removed':
        get().handleFileRemoved(e.projectId, e.file)
        break
      case 'comments-changed':
        void get().reloadThreads()
        break
    }
  },

  handleFileRemoved: (projectId, file) => {
    if (get().activeProjectId !== projectId) return
    const openDocs = get().openDocs.filter((f) => f !== file)
    const { [file]: _gone, ...fileContents } = get().fileContents
    set({ openDocs, fileContents })
    void window.fabulist.project.setOpenTabs(projectId, combinedTabs(openDocs, get().openPanels))
    if (get().activeFile === file) {
      const next = openDocs[openDocs.length - 1] ?? null
      if (next) void get().setActiveFile(next)
      else {
        set({ activeFile: null, content: '', threads: [], external: { seq: extSeq++, content: '' } })
        void window.fabulist.project.setActiveFile(projectId, null)
      }
    }
    void get().loadFiles()
    void get().loadProjects()
  },

  handleExternalChange: (projectId, file, content) => {
    if (get().activeProjectId !== projectId) return
    // cache for any open tab; only re-render the editor if it's the live file
    if (get().openDocs.includes(file) || get().activeFile === file) {
      set({ fileContents: { ...get().fileContents, [file]: content } })
    }
    if (get().activeFile === file) {
      set({
        content,
        external: { seq: extSeq++, content },
        threads: reanchor(get().threads, content)
      })
    }
    get().loadFiles()
  }
}))
