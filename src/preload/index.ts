import { contextBridge, ipcRenderer } from 'electron'
import type { EventChannels, InvokeChannels } from '@shared/channels'
import type { AgentEvent, AnchorUpdate, ChatItem, CommentAnchor, CommentThread, DisplayOptions, SendOptions } from '@shared/types'
import type { DocSettings, SettingKey } from '@shared/settings'

/** Typed `ipcRenderer.invoke`: name, args, and return type checked against the channel map. */
function invoke<C extends keyof InvokeChannels>(
  channel: C,
  ...args: Parameters<InvokeChannels[C]>
): Promise<ReturnType<InvokeChannels[C]>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<ReturnType<InvokeChannels[C]>>
}

/** Subscribe to a push channel; returns an unsubscribe function. */
function subscribe<C extends keyof EventChannels>(channel: C, cb: EventChannels[C]): () => void {
  const listener = (_e: unknown, ...args: unknown[]): void =>
    (cb as (...a: unknown[]) => void)(...args)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  /** open a web/mailto link (rendered markdown in chat) in the system browser */
  openExternal: (url: string) => invoke('app:openExternal', url),
  library: {
    list: () => invoke('library:list'),
    create: (title: string) => invoke('library:create', title),
    clone: (id: string) => invoke('library:clone', id),
    remove: (id: string) => invoke('library:delete', id),
    reveal: (id: string) => invoke('library:reveal', id)
  },
  doc: {
    read: (id: string) => invoke('doc:read', id),
    write: (id: string, content: string) => invoke('doc:write', id, content),
    snapshot: (id: string, label?: string) => invoke('doc:snapshot', id, label),
    watch: (id: string | null) => invoke('doc:watch', id),
    chat: (id: string) => invoke('doc:chat', id),
    getSettings: (id: string) => invoke('doc:getSettings', id),
    setSetting: <K extends SettingKey>(id: string, key: K, value: DocSettings[K]) =>
      invoke('doc:setSetting', id, key, value),
    attachFiles: (id: string) => invoke('doc:attachFiles', id),
    attachText: (id: string, text: string) => invoke('doc:attachText', id, text),
    removeAttachment: (id: string, rel: string) => invoke('doc:removeAttachment', id, rel),
    saveChat: (id: string, chat: ChatItem[]) => invoke('doc:saveChat', id, chat),
    onExternalChange: (cb: (id: string, content: string) => void) =>
      subscribe('doc:external-change', cb)
  },
  history: {
    log: (id: string) => invoke('history:log', id),
    show: (id: string, rev: string) => invoke('history:show', id, rev),
    restore: (id: string, rev: string) => invoke('history:restore', id, rev)
  },
  comments: {
    list: (id: string) => invoke('comments:list', id),
    add: (id: string, anchor: CommentAnchor, text: string) => invoke('comments:add', id, anchor, text),
    reply: (id: string, threadId: string, text: string) => invoke('comments:reply', id, threadId, text),
    setStatus: (id: string, threadId: string, status: CommentThread['status']) =>
      invoke('comments:setStatus', id, threadId, status),
    remove: (id: string, threadId: string) => invoke('comments:remove', id, threadId),
    updateAnchors: (id: string, anchors: AnchorUpdate[]) =>
      invoke('comments:updateAnchors', id, anchors),
    onChanged: (cb: (id: string) => void) => subscribe('comments:changed', cb)
  },
  skills: {
    installFromDisk: () => invoke('skills:installFromDisk'),
    list: () => invoke('skills:list'),
    listForDoc: (docId: string) => invoke('skills:listForDoc', docId),
    setEnabled: (docId: string, slug: string, on: boolean) =>
      invoke('skills:setEnabled', docId, slug, on),
    remove: (slug: string) => invoke('skills:remove', slug),
    read: (slug: string) => invoke('skills:read', slug),
    reveal: () => invoke('skills:reveal')
  },
  skillStudio: {
    list: () => invoke('skillStudio:list'),
    create: (name: string) => invoke('skillStudio:create', name),
    remove: (slug: string) => invoke('skillStudio:delete', slug),
    reveal: (slug?: string) => invoke('skillStudio:reveal', slug),
    listFiles: (slug: string) => invoke('skillStudio:listFiles', slug),
    listPluginSkills: (slug: string) => invoke('skillStudio:listPluginSkills', slug),
    readFile: (slug: string, rel: string) => invoke('skillStudio:readFile', slug, rel),
    writeFile: (slug: string, rel: string, content: string) =>
      invoke('skillStudio:writeFile', slug, rel, content),
    createFile: (slug: string, rel: string) => invoke('skillStudio:createFile', slug, rel),
    createFolder: (slug: string, rel: string) => invoke('skillStudio:createFolder', slug, rel),
    deleteFile: (slug: string, rel: string) => invoke('skillStudio:deleteFile', slug, rel),
    readChats: (slug: string) => invoke('skillStudio:readChats', slug),
    saveAuthChat: (slug: string, chat: ChatItem[]) => invoke('skillStudio:saveAuthChat', slug, chat),
    saveTestChat: (slug: string, chat: ChatItem[]) => invoke('skillStudio:saveTestChat', slug, chat),
    archiveTest: (slug: string, chat: ChatItem[]) => invoke('skillStudio:archiveTest', slug, chat),
    test: (slug: string, prompt: string, display?: DisplayOptions) =>
      invoke('skillStudio:test', slug, prompt, display),
    resetTest: (slug: string) => invoke('skillStudio:resetTest', slug),
    interruptTest: (slug: string) => invoke('skillStudio:interruptTest', slug),
    testBusy: (slug: string) => invoke('skillStudio:testBusy', slug),
    onEvent: (cb: (event: AgentEvent) => void) => subscribe('skillStudio:event', cb),
    authSend: (slug: string, prompt: string, autoApprove: boolean, display?: DisplayOptions) =>
      invoke('skillStudio:authSend', slug, prompt, autoApprove, display),
    authInterrupt: (slug: string) => invoke('skillStudio:authInterrupt', slug),
    authBusy: (slug: string) => invoke('skillStudio:authBusy', slug),
    onAuthEvent: (cb: (event: AgentEvent) => void) => subscribe('skillStudio:authEvent', cb),
    respondPermission: (requestId: string, approved: boolean, answers?: Record<string, string>): void => {
      ipcRenderer.send('skillStudio:permission-response', requestId, approved, answers)
    }
  },
  agent: {
    send: (id: string, prompt: string, opts?: SendOptions) =>
      invoke('agent:send', id, prompt, opts ?? {}),
    interrupt: (id: string) => invoke('agent:interrupt', id),
    busy: (id: string) => invoke('agent:busy', id),
    models: () => invoke('agent:models'),
    respondPermission: (requestId: string, approved: boolean, answers?: Record<string, string>): void => {
      ipcRenderer.send('agent:permission-response', requestId, approved, answers)
    },
    onEvent: (cb: (event: AgentEvent) => void) => subscribe('agent:event', cb)
  }
}

export type FabulistAPI = typeof api

contextBridge.exposeInMainWorld('fabulist', api)
