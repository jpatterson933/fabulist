import { contextBridge, ipcRenderer } from 'electron'
import type {
  AgentEvent,
  ChatItem,
  CommentThread,
  CommitInfo,
  DocMeta,
  DocSkill,
  ModelChoice,
  SendOptions,
  SkillMeta
} from '@shared/types'

const api = {
  library: {
    list: (): Promise<DocMeta[]> => ipcRenderer.invoke('library:list'),
    create: (title: string): Promise<DocMeta> => ipcRenderer.invoke('library:create', title),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('library:delete', id),
    reveal: (id: string): Promise<void> => ipcRenderer.invoke('library:reveal', id)
  },
  doc: {
    read: (id: string): Promise<string> => ipcRenderer.invoke('doc:read', id),
    write: (id: string, content: string): Promise<void> =>
      ipcRenderer.invoke('doc:write', id, content),
    snapshot: (id: string, label?: string): Promise<boolean> =>
      ipcRenderer.invoke('doc:snapshot', id, label),
    watch: (id: string | null): Promise<void> => ipcRenderer.invoke('doc:watch', id),
    chat: (id: string): Promise<ChatItem[]> => ipcRenderer.invoke('doc:chat', id),
    getModel: (id: string): Promise<string> => ipcRenderer.invoke('doc:getModel', id),
    setModel: (id: string, model: string): Promise<void> =>
      ipcRenderer.invoke('doc:setModel', id, model),
    getAutoApprove: (id: string): Promise<boolean> => ipcRenderer.invoke('doc:getAutoApprove', id),
    setAutoApprove: (id: string, on: boolean): Promise<void> =>
      ipcRenderer.invoke('doc:setAutoApprove', id, on),
    getFont: (id: string): Promise<string> => ipcRenderer.invoke('doc:getFont', id),
    setFont: (id: string, font: string): Promise<void> =>
      ipcRenderer.invoke('doc:setFont', id, font),
    attachFiles: (id: string): Promise<string[]> => ipcRenderer.invoke('doc:attachFiles', id),
    attachText: (id: string, text: string): Promise<string> =>
      ipcRenderer.invoke('doc:attachText', id, text),
    removeAttachment: (id: string, rel: string): Promise<void> =>
      ipcRenderer.invoke('doc:removeAttachment', id, rel),
    saveChat: (id: string, chat: ChatItem[]): Promise<void> =>
      ipcRenderer.invoke('doc:saveChat', id, chat),
    onExternalChange: (cb: (id: string, content: string) => void): (() => void) => {
      const listener = (_e: unknown, id: string, content: string): void => cb(id, content)
      ipcRenderer.on('doc:external-change', listener)
      return () => ipcRenderer.removeListener('doc:external-change', listener)
    }
  },
  history: {
    log: (id: string): Promise<CommitInfo[]> => ipcRenderer.invoke('history:log', id),
    show: (id: string, rev: string): Promise<string> => ipcRenderer.invoke('history:show', id, rev),
    restore: (id: string, rev: string): Promise<string> =>
      ipcRenderer.invoke('history:restore', id, rev)
  },
  comments: {
    list: (id: string): Promise<CommentThread[]> => ipcRenderer.invoke('comments:list', id),
    add: (id: string, anchor: CommentThread['anchor'], text: string): Promise<CommentThread> =>
      ipcRenderer.invoke('comments:add', id, anchor, text),
    reply: (id: string, threadId: string, text: string): Promise<CommentThread | null> =>
      ipcRenderer.invoke('comments:reply', id, threadId, text),
    setStatus: (id: string, threadId: string, status: CommentThread['status']): Promise<void> =>
      ipcRenderer.invoke('comments:setStatus', id, threadId, status),
    remove: (id: string, threadId: string): Promise<void> =>
      ipcRenderer.invoke('comments:remove', id, threadId),
    updateAnchors: (
      id: string,
      anchors: { id: string; anchor: CommentThread['anchor']; status?: CommentThread['status'] }[]
    ): Promise<void> => ipcRenderer.invoke('comments:updateAnchors', id, anchors),
    onChanged: (cb: (id: string) => void): (() => void) => {
      const listener = (_e: unknown, id: string): void => cb(id)
      ipcRenderer.on('comments:changed', listener)
      return () => ipcRenderer.removeListener('comments:changed', listener)
    }
  },
  skills: {
    installFromDisk: (): Promise<SkillMeta[]> => ipcRenderer.invoke('skills:installFromDisk'),
    list: (): Promise<SkillMeta[]> => ipcRenderer.invoke('skills:list'),
    listForDoc: (docId: string): Promise<DocSkill[]> =>
      ipcRenderer.invoke('skills:listForDoc', docId),
    setEnabled: (docId: string, slug: string, on: boolean): Promise<void> =>
      ipcRenderer.invoke('skills:setEnabled', docId, slug, on),
    remove: (slug: string): Promise<void> => ipcRenderer.invoke('skills:remove', slug),
    read: (slug: string): Promise<string> => ipcRenderer.invoke('skills:read', slug),
    reveal: (): Promise<void> => ipcRenderer.invoke('skills:reveal')
  },
  agent: {
    send: (id: string, prompt: string, opts?: SendOptions): Promise<void> =>
      ipcRenderer.invoke('agent:send', id, prompt, opts ?? {}),
    interrupt: (id: string): Promise<void> => ipcRenderer.invoke('agent:interrupt', id),
    busy: (id: string): Promise<boolean> => ipcRenderer.invoke('agent:busy', id),
    models: (): Promise<ModelChoice[]> => ipcRenderer.invoke('agent:models'),
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
