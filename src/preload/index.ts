import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  AgentEvent,
  AgentThread,
  Attachment,
  ChatItem,
  CommentThread,
  CommitInfo,
  DocMeta,
  ModelChoice,
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
      ipcRenderer.invoke('harness:setTrusted', id, trusted),
    onChanged: (cb: (id: string) => void): (() => void) => {
      const listener = (_e: unknown, id: string): void => cb(id)
      ipcRenderer.on('harness:changed', listener)
      return () => ipcRenderer.removeListener('harness:changed', listener)
    }
  },
  project: {
    docs: (id: string): Promise<DocMeta[]> => ipcRenderer.invoke('project:docs', id),
    meta: (
      id: string
    ): Promise<{ title: string; docs: { file: string; font?: string }[]; openTabs: string[]; activeDoc: string | null }> =>
      ipcRenderer.invoke('project:meta', id),
    createDoc: (id: string, title: string, typeId?: string): Promise<DocMeta> =>
      ipcRenderer.invoke('project:createDoc', id, title, typeId),
    deleteDoc: (id: string, docFile: string): Promise<void> =>
      ipcRenderer.invoke('project:deleteDoc', id, docFile),
    setOpenTabs: (id: string, openTabs: string[]): Promise<void> =>
      ipcRenderer.invoke('project:setOpenTabs', id, openTabs),
    setActiveDoc: (id: string, docFile: string | null): Promise<void> =>
      ipcRenderer.invoke('project:setActiveDoc', id, docFile),
    getModel: (id: string): Promise<string> => ipcRenderer.invoke('project:getModel', id),
    setModel: (id: string, model: string): Promise<void> =>
      ipcRenderer.invoke('project:setModel', id, model),
    watch: (id: string | null): Promise<void> => ipcRenderer.invoke('project:watch', id)
  },
  doc: {
    read: (id: string, docFile: string): Promise<string> =>
      ipcRenderer.invoke('doc:read', id, docFile),
    write: (id: string, docFile: string, content: string): Promise<void> =>
      ipcRenderer.invoke('doc:write', id, docFile, content),
    snapshot: (id: string, label?: string): Promise<boolean> =>
      ipcRenderer.invoke('doc:snapshot', id, label),
    getFont: (id: string, docFile: string): Promise<string> =>
      ipcRenderer.invoke('doc:getFont', id, docFile),
    setFont: (id: string, docFile: string, font: string): Promise<void> =>
      ipcRenderer.invoke('doc:setFont', id, docFile, font),
    onExternalChange: (cb: (id: string, docFile: string, content: string) => void): (() => void) => {
      const listener = (_e: unknown, id: string, docFile: string, content: string): void =>
        cb(id, docFile, content)
      ipcRenderer.on('doc:external-change', listener)
      return () => ipcRenderer.removeListener('doc:external-change', listener)
    },
    onRemoved: (cb: (id: string, docFile: string) => void): (() => void) => {
      const listener = (_e: unknown, id: string, docFile: string): void => cb(id, docFile)
      ipcRenderer.on('doc:removed', listener)
      return () => ipcRenderer.removeListener('doc:removed', listener)
    }
  },
  history: {
    log: (id: string): Promise<CommitInfo[]> => ipcRenderer.invoke('history:log', id),
    show: (id: string, docFile: string, rev: string): Promise<string> =>
      ipcRenderer.invoke('history:show', id, docFile, rev),
    restore: (id: string, docFile: string, rev: string): Promise<string> =>
      ipcRenderer.invoke('history:restore', id, docFile, rev)
  },
  comments: {
    list: (id: string, docFile: string): Promise<CommentThread[]> =>
      ipcRenderer.invoke('comments:list', id, docFile),
    add: (
      id: string,
      docFile: string,
      anchor: CommentThread['anchor'],
      text: string
    ): Promise<CommentThread> => ipcRenderer.invoke('comments:add', id, docFile, anchor, text),
    reply: (
      id: string,
      docFile: string,
      threadId: string,
      text: string
    ): Promise<CommentThread | null> =>
      ipcRenderer.invoke('comments:reply', id, docFile, threadId, text),
    setStatus: (
      id: string,
      docFile: string,
      threadId: string,
      status: CommentThread['status']
    ): Promise<void> => ipcRenderer.invoke('comments:setStatus', id, docFile, threadId, status),
    remove: (id: string, docFile: string, threadId: string): Promise<void> =>
      ipcRenderer.invoke('comments:remove', id, docFile, threadId),
    updateAnchors: (
      id: string,
      docFile: string,
      anchors: { id: string; anchor: CommentThread['anchor']; status?: CommentThread['status'] }[]
    ): Promise<void> => ipcRenderer.invoke('comments:updateAnchors', id, docFile, anchors),
    onChanged: (cb: (id: string) => void): (() => void) => {
      const listener = (_e: unknown, id: string): void => cb(id)
      ipcRenderer.on('comments:changed', listener)
      return () => ipcRenderer.removeListener('comments:changed', listener)
    }
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
