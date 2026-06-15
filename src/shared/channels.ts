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
  ChatItem,
  CommentAnchor,
  CommentThread,
  CommitInfo,
  DocMeta,
  DocSkill,
  ModelChoice,
  SendOptions,
  SkillMeta,
  StudioFile,
  StudioSkill
} from './types'
import type { DocSettings, SettingKey } from './settings'

/**
 * Request/response channels (`ipcRenderer.invoke` ↔ `ipcMain.handle`). Each
 * value type is the RESOLVED result; the helpers wrap it in a Promise.
 */
export interface InvokeChannels {
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

  // Skill Studio — author skills as a real local Claude plugin (.skill-studio/),
  // separate from the consume library above, and test them in a jailed sandbox.
  'skillStudio:list': () => StudioSkill[]
  'skillStudio:create': (name: string) => StudioSkill
  'skillStudio:delete': (slug: string) => void
  'skillStudio:reveal': (slug?: string) => void
  'skillStudio:listFiles': (slug: string) => StudioFile[]
  'skillStudio:readFile': (slug: string, rel: string) => string
  'skillStudio:writeFile': (slug: string, rel: string, content: string) => void
  'skillStudio:createFile': (slug: string, rel: string) => void
  'skillStudio:createFolder': (slug: string, rel: string) => void
  'skillStudio:deleteFile': (slug: string, rel: string) => void
  'skillStudio:test': (slug: string, prompt: string) => void
  'skillStudio:resetTest': (slug: string) => void
  'skillStudio:interruptTest': (slug: string) => void
  'skillStudio:testBusy': (slug: string) => boolean
  // the authoring chat — an agent that reads/edits the skill IN its own folder
  'skillStudio:authSend': (slug: string, prompt: string) => void
  'skillStudio:authInterrupt': (slug: string) => void
  'skillStudio:authBusy': (slug: string) => boolean

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
}

/** Push channels main→renderer (`webContents.send` ↔ `ipcRenderer.on`). */
export interface EventChannels {
  'agent:event': (event: AgentEvent) => void
  /** Streaming for a Skill Studio test run; reuses AgentEvent with docId = the skill slug. */
  'skillStudio:event': (event: AgentEvent) => void
  /** Streaming for the Skill Studio authoring chat; reuses AgentEvent with docId = the skill slug. */
  'skillStudio:authEvent': (event: AgentEvent) => void
  'doc:external-change': (id: string, content: string) => void
  'comments:changed': (id: string) => void
}

export type InvokeChannel = keyof InvokeChannels
export type SendChannel = keyof SendChannels
export type EventChannel = keyof EventChannels
