// The single source of truth for the IPC contract between main, preload, and
// renderer. Each channel's name, arguments, and return type are declared here
// exactly once; the preload bridge and the main handlers both derive their
// signatures from these maps (see src/preload/index.ts and src/main/ipcTyped.ts),
// so a typo or an arity/type drift is a compile error rather than a silent
// runtime hang. Type-only by design — no `electron` import — so it is safe to
// pull into the renderer bundle too.

import type {
  AgentEvent,
  AnchorUpdate,
  ArchivedTest,
  ChatItem,
  CommentAnchor,
  CommentThread,
  CommitInfo,
  DisplayOptions,
  DocMeta,
  DocSkill,
  ModelChoice,
  SendOptions,
  SkillMeta,
  StudioChanges,
  StudioFile,
  StudioFileDiff,
  StudioSettings,
  StudioSettingKey,
  StudioSkill
} from './types'
import type { DocSettings, SettingKey } from './settings'

/**
 * Request/response channels (`ipcRenderer.invoke` ↔ `ipcMain.handle`). Each
 * value type is the RESOLVED result; the helpers wrap it in a Promise.
 */
export interface InvokeChannels {
  /** Open a web/mailto URL in the system browser (markdown links in chat) — never navigates the app window. */
  'app:openExternal': (url: string) => void

  'library:list': () => DocMeta[]
  'library:create': (title: string) => DocMeta
  'library:clone': (id: string) => DocMeta
  'library:delete': (id: string) => void
  'library:reveal': (id: string) => void

  'doc:read': (id: string) => string
  'doc:write': (id: string, content: string) => void
  'doc:snapshot': (id: string, label?: string) => boolean
  'doc:watch': (id: string | null) => void
  'doc:chat': (id: string) => ChatItem[]
  'doc:getSettings': (id: string) => DocSettings
  'doc:setSetting': (id: string, key: SettingKey, value: DocSettings[SettingKey]) => void
  'doc:attachFiles': (id: string) => string[]
  'doc:attachText': (id: string, text: string) => string
  'doc:removeAttachment': (id: string, rel: string) => void
  'doc:saveChat': (id: string, chat: ChatItem[]) => void

  'skills:installFromDisk': () => SkillMeta[]
  'skills:list': () => SkillMeta[]
  'skills:listForDoc': (docId: string) => DocSkill[]
  'skills:setEnabled': (docId: string, slug: string, on: boolean) => void
  'skills:remove': (slug: string) => void
  'skills:read': (slug: string) => string
  'skills:reveal': () => void

  // Plugin Studio — author skills as a real local Claude plugin (.skill-studio/),
  // separate from the consume library above, and test them in a jailed sandbox.
  'skillStudio:list': () => StudioSkill[]
  'skillStudio:create': (name: string) => StudioSkill
  'skillStudio:delete': (slug: string) => void
  'skillStudio:reveal': (slug?: string) => void
  'skillStudio:listFiles': (slug: string) => StudioFile[]
  /** the skills the plugin ships (name + description) — for the Test tab "/" picker */
  'skillStudio:listPluginSkills': (slug: string) => { name: string; description: string }[]
  'skillStudio:readFile': (slug: string, rel: string) => string
  'skillStudio:writeFile': (slug: string, rel: string, content: string) => void
  'skillStudio:createFile': (slug: string, rel: string) => void
  'skillStudio:createFolder': (slug: string, rel: string) => void
  'skillStudio:deleteFile': (slug: string, rel: string) => void
  // per-skill settings (model + auto-apply), persisted under .skill-studio/.state/<slug>.json.
  // Mirrors doc:getSettings / doc:setSetting — main reads them when it launches the agent.
  'skillStudio:getSettings': (slug: string) => StudioSettings
  'skillStudio:setSetting': (
    slug: string,
    key: StudioSettingKey,
    value: StudioSettings[StudioSettingKey]
  ) => void
  // persisted authoring + test transcripts (+ live test version + archive), so they
  // survive an app restart
  'skillStudio:readChats': (slug: string) => {
    authChat: ChatItem[]
    testChat: ChatItem[]
    testVersion: number
    archivedTests: ArchivedTest[]
  }
  'skillStudio:saveAuthChat': (slug: string, chat: ChatItem[]) => void
  'skillStudio:saveTestChat': (slug: string, chat: ChatItem[]) => void
  /** archive the current test under its version, bump to the next, clear the live thread */
  'skillStudio:archiveTest': (
    slug: string,
    chat: ChatItem[]
  ) => { version: string; at: number; nextVersion: number }
  // `display` separates the chat echo (the user's task + a short "Using the X skill"
  // marker) from the full prompt the model receives (which carries the invocation directive)
  'skillStudio:test': (slug: string, prompt: string, display?: DisplayOptions) => void
  'skillStudio:resetTest': (slug: string) => void
  'skillStudio:interruptTest': (slug: string) => void
  'skillStudio:testBusy': (slug: string) => boolean
  // the authoring chat — an agent that reads/edits the skill IN its own folder. Auto-apply
  // is read from the skill's persisted settings by main (skillStudio:getSettings), mirroring
  // the document app, so it is not a send argument. `display` separates what the chat shows
  // (echo + a short quote marker) from the full prompt the model receives (test transcript).
  'skillStudio:authSend': (slug: string, prompt: string, display?: DisplayOptions) => void
  'skillStudio:authInterrupt': (slug: string) => void
  'skillStudio:authBusy': (slug: string) => boolean
  /** start a fresh authoring conversation: clears the transcript + rotates the SDK resume session, leaving the skill's files intact */
  'skillStudio:resetAuth': (slug: string) => void

  // Version control — git-backed, one repo per skill: working tree = Changes,
  // index = Staged, HEAD = the committed copy. Every op is scoped to the active skill.
  'skillStudio:changes': (slug: string) => StudioChanges
  /** before/after text for one file's diff, in the Changes or Staged scope */
  'skillStudio:diff': (slug: string, rel: string, scope: 'changes' | 'staged') => StudioFileDiff
  'skillStudio:stage': (slug: string, rel: string) => void
  'skillStudio:stageAll': (slug: string) => void
  'skillStudio:unstage': (slug: string, rel: string) => void
  'skillStudio:unstageAll': (slug: string) => void
  'skillStudio:discard': (slug: string, rel: string) => void
  'skillStudio:discardAll': (slug: string) => void
  /** commit the staged index; returns false when nothing is staged */
  'skillStudio:commit': (slug: string) => boolean

  'history:log': (id: string) => CommitInfo[]
  'history:show': (id: string, rev: string) => string
  'history:restore': (id: string, rev: string) => string

  'comments:list': (id: string) => CommentThread[]
  'comments:add': (id: string, anchor: CommentAnchor, text: string) => CommentThread
  'comments:reply': (id: string, threadId: string, text: string) => CommentThread | null
  'comments:setStatus': (id: string, threadId: string, status: CommentThread['status']) => void
  'comments:remove': (id: string, threadId: string) => void
  'comments:updateAnchors': (id: string, anchors: AnchorUpdate[]) => void

  'agent:send': (id: string, prompt: string, opts: SendOptions) => void
  'agent:interrupt': (id: string) => void
  'agent:busy': (id: string) => boolean
  'agent:models': () => ModelChoice[]
}

/** Fire-and-forget renderer→main messages (`ipcRenderer.send` ↔ `ipcMain.on`). */
export interface SendChannels {
  'agent:permission-response': (
    requestId: string,
    approved: boolean,
    answers?: Record<string, string>
  ) => void
  /** Answer a Plugin Studio approval/question (test or authoring) — routed by requestId. */
  'skillStudio:permission-response': (
    requestId: string,
    approved: boolean,
    answers?: Record<string, string>
  ) => void
}

/** Push channels main→renderer (`webContents.send` ↔ `ipcRenderer.on`). */
export interface EventChannels {
  'agent:event': (event: AgentEvent) => void
  /** Streaming for a Plugin Studio test run; reuses AgentEvent with docId = the skill slug. */
  'skillStudio:event': (event: AgentEvent) => void
  /** Streaming for the Plugin Studio authoring chat; reuses AgentEvent with docId = the skill slug. */
  'skillStudio:authEvent': (event: AgentEvent) => void
  'doc:external-change': (id: string, content: string) => void
  'comments:changed': (id: string) => void
}

export type InvokeChannel = keyof InvokeChannels
export type SendChannel = keyof SendChannels
export type EventChannel = keyof EventChannels
