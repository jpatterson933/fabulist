import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  AgentEvent,
  AgentThread,
  Attachment,
  ChatItem,
  CommandEvent,
  CommandRunState,
  CommentThread,
  CommitInfo,
  FileMeta,
  ModelChoice,
  ProjectEvent,
  ProjectMeta,
  SendOptions
} from '@shared/types'
import type { Harness } from '@shared/harness'

const api = {
  library: {
    projects: (): Promise<ProjectMeta[]> => ipcRenderer.invoke('library:projects'),
    createProject: (title: string): Promise<ProjectMeta> =>
      ipcRenderer.invoke('library:createProject', title),
    deleteProject: (id: string): Promise<void> => ipcRenderer.invoke('library:deleteProject', id),
    reveal: (id: string): Promise<void> => ipcRenderer.invoke('library:reveal', id),
    openFolder: (): Promise<string | null> => ipcRenderer.invoke('library:openFolder')
  },
  harness: {
    load: (id: string): Promise<Harness> => ipcRenderer.invoke('harness:load', id),
    setTrusted: (id: string, trusted: boolean): Promise<void> =>
      ipcRenderer.invoke('harness:setTrusted', id, trusted)
  },
  commands: {
    start: (id: string, commandId: string): Promise<void> =>
      ipcRenderer.invoke('command:start', id, commandId),
    stop: (id: string, commandId: string): Promise<void> =>
      ipcRenderer.invoke('command:stop', id, commandId),
    status: (id: string): Promise<Record<string, CommandRunState>> =>
      ipcRenderer.invoke('command:status', id),
    onEvent: (cb: (event: CommandEvent) => void): (() => void) => {
      const listener = (_e: unknown, event: CommandEvent): void => cb(event)
      ipcRenderer.on('command:event', listener)
      return () => ipcRenderer.removeListener('command:event', listener)
    }
  },
  templates: {
    list: (): Promise<{ id: string; name: string; description: string }[]> =>
      ipcRenderer.invoke('templates:list'),
    create: (templateId: string, title: string): Promise<string> =>
      ipcRenderer.invoke('templates:create', templateId, title),
    createFromProject: (id: string, title: string): Promise<string> =>
      ipcRenderer.invoke('templates:createFromProject', id, title)
  },
  project: {
    files: (id: string): Promise<FileMeta[]> => ipcRenderer.invoke('project:files', id),
    meta: (
      id: string
    ): Promise<{ title: string; files: { file: string; font?: string }[]; openTabs: string[]; activeFile: string | null }> =>
      ipcRenderer.invoke('project:meta', id),
    createFile: (id: string, title: string, typeId?: string): Promise<FileMeta> =>
      ipcRenderer.invoke('project:createFile', id, title, typeId),
    deleteFile: (id: string, file: string): Promise<void> =>
      ipcRenderer.invoke('project:deleteFile', id, file),
    setOpenTabs: (id: string, openTabs: string[]): Promise<void> =>
      ipcRenderer.invoke('project:setOpenTabs', id, openTabs),
    setActiveFile: (id: string, file: string | null): Promise<void> =>
      ipcRenderer.invoke('project:setActiveFile', id, file),
    snapshot: (id: string, label?: string): Promise<boolean> =>
      ipcRenderer.invoke('project:snapshot', id, label),
    getModel: (id: string): Promise<string> => ipcRenderer.invoke('project:getModel', id),
    setModel: (id: string, model: string): Promise<void> =>
      ipcRenderer.invoke('project:setModel', id, model),
    watch: (id: string | null): Promise<void> => ipcRenderer.invoke('project:watch', id),
    onEvent: (cb: (event: ProjectEvent) => void): (() => void) => {
      const listener = (_e: unknown, event: ProjectEvent): void => cb(event)
      ipcRenderer.on('project:event', listener)
      return () => ipcRenderer.removeListener('project:event', listener)
    }
  },
  file: {
    read: (id: string, file: string): Promise<string> =>
      ipcRenderer.invoke('file:read', id, file),
    write: (id: string, file: string, content: string): Promise<void> =>
      ipcRenderer.invoke('file:write', id, file, content),
    getFont: (id: string, file: string): Promise<string> =>
      ipcRenderer.invoke('file:getFont', id, file),
    setFont: (id: string, file: string, font: string): Promise<void> =>
      ipcRenderer.invoke('file:setFont', id, file, font)
  },
  history: {
    log: (id: string): Promise<CommitInfo[]> => ipcRenderer.invoke('history:log', id),
    show: (id: string, file: string, rev: string): Promise<string> =>
      ipcRenderer.invoke('history:show', id, file, rev),
    restore: (id: string, file: string, rev: string): Promise<string> =>
      ipcRenderer.invoke('history:restore', id, file, rev)
  },
  comments: {
    list: (id: string, file: string): Promise<CommentThread[]> =>
      ipcRenderer.invoke('comments:list', id, file),
    add: (
      id: string,
      file: string,
      anchor: CommentThread['anchor'],
      text: string
    ): Promise<CommentThread> => ipcRenderer.invoke('comments:add', id, file, anchor, text),
    reply: (
      id: string,
      file: string,
      threadId: string,
      text: string
    ): Promise<CommentThread | null> =>
      ipcRenderer.invoke('comments:reply', id, file, threadId, text),
    setStatus: (
      id: string,
      file: string,
      threadId: string,
      status: CommentThread['status']
    ): Promise<void> => ipcRenderer.invoke('comments:setStatus', id, file, threadId, status),
    remove: (id: string, file: string, threadId: string): Promise<void> =>
      ipcRenderer.invoke('comments:remove', id, file, threadId),
    updateAnchors: (
      id: string,
      file: string,
      anchors: { id: string; anchor: CommentThread['anchor']; status?: CommentThread['status'] }[]
    ): Promise<void> => ipcRenderer.invoke('comments:updateAnchors', id, file, anchors)
  },
  agent: {
    send: (id: string, threadId: string, prompt: string, opts?: SendOptions): Promise<void> =>
      ipcRenderer.invoke('agent:send', id, threadId, prompt, opts ?? {}),
    pickAttachments: (): Promise<Attachment[]> => ipcRenderer.invoke('agent:pick-attachments'),
    // webUtils is only available in the preload, not the sandboxed renderer
    attachmentPathForFile: (file: File): string => webUtils.getPathForFile(file),
    interrupt: (id: string): Promise<void> => ipcRenderer.invoke('agent:interrupt', id),
    busy: (id: string): Promise<boolean> => ipcRenderer.invoke('agent:busy', id),
    models: (): Promise<ModelChoice[]> => ipcRenderer.invoke('agent:models'),
    threads: (id: string): Promise<AgentThread[]> => ipcRenderer.invoke('agent:threads', id),
    activeThread: (id: string): Promise<string> => ipcRenderer.invoke('agent:activeThread', id),
    threadChat: (id: string, threadId: string): Promise<ChatItem[]> =>
      ipcRenderer.invoke('agent:thread:chat', id, threadId),
    createThread: (id: string, title?: string, kind?: 'workshop'): Promise<AgentThread> =>
      ipcRenderer.invoke('agent:thread:create', id, title, kind),
    renameThread: (id: string, threadId: string, title: string): Promise<void> =>
      ipcRenderer.invoke('agent:thread:rename', id, threadId, title),
    deleteThread: (id: string, threadId: string): Promise<{ activeThreadId: string }> =>
      ipcRenderer.invoke('agent:thread:delete', id, threadId),
    activateThread: (id: string, threadId: string): Promise<void> =>
      ipcRenderer.invoke('agent:thread:activate', id, threadId),
    saveChat: (id: string, threadId: string, chat: ChatItem[]): Promise<void> =>
      ipcRenderer.invoke('agent:thread:saveChat', id, threadId, chat),
    respondPermission: (requestId: string, approved: boolean): void => {
      ipcRenderer.send('agent:permission-response', requestId, approved)
    },
    onEvent: (cb: (event: AgentEvent) => void): (() => void) => {
      const listener = (_e: unknown, event: AgentEvent): void => cb(event)
      ipcRenderer.on('agent:event', listener)
      return () => ipcRenderer.removeListener('agent:event', listener)
    }
  }
}

export type FabulistAPI = typeof api

contextBridge.exposeInMainWorld('fabulist', api)
