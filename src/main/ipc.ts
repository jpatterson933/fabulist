import { ipcMain, shell, type BrowserWindow } from 'electron'
import { watch, promises as fs, type FSWatcher } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import type { CommentThread, SendOptions } from '@shared/types'
import * as library from './library'
import * as git from './git'
import * as comments from './comments'
import { agentManager } from './agent'
import * as skills from './skills'

const DOC_FILE = library.DOC_FILE

export function registerIpc(win: BrowserWindow): void {
  agentManager.attach(win.webContents)

  // --- library ---
  ipcMain.handle('library:list', () => library.listDocs())
  ipcMain.handle('library:create', (_e, title: string) => library.createDoc(title))
  ipcMain.handle('library:delete', (_e, id: string) => library.deleteDoc(id))
  ipcMain.handle('library:reveal', (_e, id: string) => {
    shell.showItemInFolder(path.join(library.docPath(id), DOC_FILE))
  })
  ipcMain.handle('doc:attachFiles', (_e, id: string) => library.attachFiles(id))
  ipcMain.handle('doc:attachText', (_e, id: string, text: string) =>
    library.attachText(id, text)
  )
  ipcMain.handle('doc:removeAttachment', (_e, id: string, rel: string) =>
    library.removeAttachment(id, rel)
  )

  // --- document content; track our own writes so the watcher can skip echoes ---
  const lastWritten = new Map<string, string>()
  const hash = (s: string): string => createHash('sha1').update(s).digest('hex')

  ipcMain.handle('doc:read', async (_e, id: string) => {
    const content = await library.readDoc(id)
    lastWritten.set(id, hash(content))
    return content
  })

  ipcMain.handle('doc:write', async (_e, id: string, content: string) => {
    lastWritten.set(id, hash(content))
    await library.writeDoc(id, content)
  })

  ipcMain.handle('doc:snapshot', async (_e, id: string, label?: string) => {
    return git.commitAll(library.docPath(id), label?.trim() || 'Snapshot')
  })

  ipcMain.handle('doc:chat', async (_e, id: string) => (await library.readState(id)).chat ?? [])
  ipcMain.handle('doc:getModel', async (_e, id: string) => (await library.readState(id)).model ?? '')
  ipcMain.handle('doc:setModel', (_e, id: string, model: string) =>
    library.patchState(id, { model: model || undefined })
  )
  ipcMain.handle('doc:getAutoApprove', async (_e, id: string) =>
    Boolean((await library.readState(id)).autoApprove)
  )
  ipcMain.handle('doc:setAutoApprove', (_e, id: string, on: boolean) =>
    library.patchState(id, { autoApprove: on || undefined })
  )
  ipcMain.handle('doc:getFont', async (_e, id: string) => (await library.readState(id)).font ?? '')
  ipcMain.handle('doc:setFont', (_e, id: string, font: string) =>
    library.patchState(id, { font: font || undefined })
  )
  ipcMain.handle('doc:saveChat', (_e, id: string, chat: unknown[]) =>
    library.patchState(id, { chat })
  )

  // --- skills (self-contained; see src/main/skills.ts) ---
  ipcMain.handle('skills:installFromDisk', () => skills.installFromDisk())
  ipcMain.handle('skills:list', () => skills.list())
  ipcMain.handle('skills:listForDoc', (_e, docId: string) => skills.listForDoc(docId))
  ipcMain.handle('skills:setEnabled', (_e, docId: string, slug: string, on: boolean) =>
    skills.setEnabled(docId, slug, on)
  )
  ipcMain.handle('skills:remove', (_e, slug: string) => skills.remove(slug))
  ipcMain.handle('skills:read', (_e, slug: string) => skills.readSkillFile(slug))
  ipcMain.handle('skills:reveal', () => {
    shell.openPath(skills.SKILLS_ROOT)
  })

  // --- history ---
  ipcMain.handle('history:log', (_e, id: string) => git.log(library.docPath(id)))
  ipcMain.handle('history:show', async (_e, id: string, rev: string) => {
    return git.showFile(library.docPath(id), rev, DOC_FILE)
  })
  ipcMain.handle('history:restore', async (_e, id: string, rev: string) => {
    const dir = library.docPath(id)
    const old = await git.showFile(dir, rev, DOC_FILE)
    await git.commitAll(dir, 'Before restore') // keep any uncommitted work reachable
    lastWritten.set(id, hash(old))
    await library.writeDoc(id, old)
    await git.commitAll(dir, `Restored version ${rev.slice(0, 7)}`)
    return old
  })

  // --- comments ---
  ipcMain.handle('comments:list', (_e, id: string) => comments.listThreads(id))
  ipcMain.handle('comments:add', (_e, id: string, anchor: CommentThread['anchor'], text: string) =>
    comments.addThread(id, anchor, text)
  )
  ipcMain.handle('comments:reply', (_e, id: string, threadId: string, text: string) =>
    comments.reply(id, threadId, 'you', text)
  )
  ipcMain.handle('comments:setStatus', (_e, id: string, threadId: string, status: CommentThread['status']) =>
    comments.setStatus(id, threadId, status)
  )
  ipcMain.handle('comments:remove', (_e, id: string, threadId: string) =>
    comments.removeThread(id, threadId)
  )
  ipcMain.handle(
    'comments:updateAnchors',
    (_e, id: string, anchors: { id: string; anchor: CommentThread['anchor']; status?: CommentThread['status'] }[]) =>
      comments.updateAnchors(id, anchors)
  )

  // --- agent ---
  ipcMain.handle('agent:send', (_e, id: string, prompt: string, opts: SendOptions) => {
    // fire and forget; progress flows back over agent:event
    agentManager.send(id, prompt, opts).catch((err) => {
      win.webContents.send('agent:event', {
        kind: 'status',
        docId: id,
        status: 'error',
        detail: err instanceof Error ? err.message : String(err)
      })
    })
  })
  ipcMain.handle('agent:interrupt', (_e, id: string) => agentManager.interrupt(id))
  ipcMain.handle('agent:busy', (_e, id: string) => agentManager.isBusy(id))
  ipcMain.handle('agent:models', () => agentManager.listModels())
  // warm the cache so the picker is populated by the time a doc is open
  void agentManager.listModels()
  ipcMain.on(
    'agent:permission-response',
    (_e, requestId: string, approved: boolean, answers?: Record<string, string>) => {
      agentManager.resolvePermission(requestId, approved, answers)
    }
  )

  // --- watch the open doc folder for external changes (Claude's edits land here) ---
  let watcher: FSWatcher | null = null
  let watchedId: string | null = null
  const timers = new Map<string, NodeJS.Timeout>()

  ipcMain.handle('doc:watch', (_e, id: string | null) => {
    watcher?.close()
    watcher = null
    watchedId = id
    if (!id) return
    // a renderer reload mid-approval must re-learn about pending requests
    agentManager.resendPending(id)
    const dir = library.docPath(id)
    watcher = watch(dir, (_event, filename) => {
      if (!filename || watchedId !== id) return
      if (filename !== DOC_FILE && filename !== library.COMMENTS_FILE) return
      // debounce per file
      clearTimeout(timers.get(filename))
      timers.set(
        filename,
        setTimeout(async () => {
          try {
            if (filename === DOC_FILE) {
              const content = await fs.readFile(path.join(dir, DOC_FILE), 'utf8')
              if (lastWritten.get(id) === hash(content)) return
              lastWritten.set(id, hash(content))
              win.webContents.send('doc:external-change', id, content)
            } else {
              win.webContents.send('comments:changed', id)
            }
          } catch {
            /* file may be mid-write */
          }
        }, 150)
      )
    })
  })
}
