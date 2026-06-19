import { shell, type BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import { handle, onSend, emitEvent } from './ipcTyped'
import * as library from './library'
import * as versioning from './versioning'
import * as comments from './comments'
import { agentManager } from './agent'
import * as skills from './skills'
import * as skillStudio from './skillStudio'
import * as studioVcs from './studioVcs'
import { studioAgent } from './studioAgent'
import { watchFiles, type DocWatcher } from './docWatcher'

const DOC_FILE = library.DOC_FILE

/**
 * Wire every IPC channel. Each domain registers its own channels through a
 * focused function below, so the hub is a table of contents rather than one
 * 179-line god-function with the file watcher and restore logic baked in.
 */
export function registerIpc(win: BrowserWindow): void {
  // open web/mailto links (rendered markdown in chat) in the system browser, guarded to
  // safe schemes so a link can't launch a file/custom-protocol handler
  handle('app:openExternal', (_e, url) => {
    if (/^(https?:|mailto:)/i.test(url)) void shell.openExternal(url)
  })
  registerLibrary()
  registerDocContent(win)
  registerVersioning()
  registerComments()
  registerSkills()
  registerSkillStudio(win)
  registerAgent(win)
}

function registerLibrary(): void {
  handle('library:list', () => library.listDocs())
  handle('library:create', (_e, title) => library.createDoc(title))
  handle('library:clone', (_e, id) => library.cloneDoc(id))
  handle('library:delete', (_e, id) => library.deleteDoc(id))
  handle('library:reveal', (_e, id) => {
    shell.showItemInFolder(library.docFile(id))
  })
  handle('doc:attachFiles', (_e, id) => library.attachFiles(id))
  handle('doc:attachText', (_e, id, text) => library.attachText(id, text))
  handle('doc:removeAttachment', (_e, id, rel) => library.removeAttachment(id, rel))
}

function registerDocContent(win: BrowserWindow): void {
  handle('doc:read', (_e, id) => library.readDoc(id))
  handle('doc:write', (_e, id, content) => library.writeDoc(id, content))
  handle('doc:chat', (_e, id) => library.readChat(id))
  handle('doc:getSettings', (_e, id) => library.readSettings(id))
  handle('doc:setSetting', (_e, id, key, value) => library.writeSetting(id, key, value))
  handle('doc:saveChat', (_e, id, chat) => library.patchState(id, { chat }))

  // --- watch the open doc folder for external changes (Claude's edits land here) ---
  let watcher: DocWatcher | null = null
  let watchedId: string | null = null

  handle('doc:watch', (_e, id) => {
    watcher?.close()
    watcher = null
    watchedId = id
    if (!id) return
    // a renderer reload mid-approval must re-learn about pending requests
    agentManager.resendPending(id)
    watcher = watchFiles(library.docPath(id), [DOC_FILE, library.COMMENTS_FILE], async (filename) => {
      if (watchedId !== id) return
      try {
        if (filename === DOC_FILE) {
          const content = await fs.readFile(library.docFile(id), 'utf8')
          if (library.isEcho(id, content)) return // our own write, not an external edit
          library.recordWrite(id, content)
          emitEvent(win.webContents, 'doc:external-change', id, content)
        } else {
          emitEvent(win.webContents, 'comments:changed', id)
        }
      } catch {
        /* file may be mid-write */
      }
    })
  })
}

function registerVersioning(): void {
  handle('doc:snapshot', (_e, id, label) => versioning.snapshot(id, label))
  handle('history:log', (_e, id) => versioning.log(id))
  handle('history:show', (_e, id, rev) => versioning.show(id, rev))
  handle('history:restore', (_e, id, rev) => versioning.restore(id, rev))
}

function registerComments(): void {
  handle('comments:list', (_e, id) => comments.listThreads(id))
  handle('comments:add', (_e, id, anchor, text) => comments.addThread(id, anchor, text))
  handle('comments:reply', (_e, id, threadId, text) => comments.reply(id, threadId, 'you', text))
  handle('comments:setStatus', (_e, id, threadId, status) =>
    comments.setStatus(id, threadId, status)
  )
  handle('comments:remove', (_e, id, threadId) => comments.removeThread(id, threadId))
  handle('comments:updateAnchors', (_e, id, anchors) => comments.updateAnchors(id, anchors))
}

function registerSkills(): void {
  handle('skills:installFromDisk', () => skills.installFromDisk())
  handle('skills:list', () => skills.list())
  handle('skills:listForDoc', (_e, docId) => skills.listForDoc(docId))
  handle('skills:setEnabled', (_e, docId, slug, on) => skills.setEnabled(docId, slug, on))
  handle('skills:remove', (_e, slug) => skills.remove(slug))
  handle('skills:read', (_e, slug) => skills.readSkillFile(slug))
  handle('skills:reveal', () => {
    shell.openPath(skills.SKILLS_ROOT)
  })
}

function registerSkillStudio(win: BrowserWindow): void {
  studioAgent.attach(win.webContents)

  handle('skillStudio:list', () => skillStudio.listSkills())
  handle('skillStudio:create', (_e, name) => skillStudio.createSkill(name))
  handle('skillStudio:delete', (_e, slug) => skillStudio.deleteSkill(slug))
  handle('skillStudio:reveal', (_e, slug) => skillStudio.reveal(slug))
  handle('skillStudio:export', (_e, slug) => skillStudio.exportPlugin(slug))
  handle('skillStudio:listFiles', (_e, slug) => skillStudio.listFiles(slug))
  handle('skillStudio:listPluginSkills', (_e, slug) => skillStudio.listPluginSkills(slug))
  handle('skillStudio:readFile', (_e, slug, rel) => skillStudio.readFile(slug, rel))
  handle('skillStudio:writeFile', (_e, slug, rel, content) =>
    skillStudio.writeFile(slug, rel, content)
  )
  handle('skillStudio:createFile', (_e, slug, rel) => skillStudio.createFile(slug, rel))
  handle('skillStudio:createFolder', (_e, slug, rel) => skillStudio.createFolder(slug, rel))
  handle('skillStudio:deleteFile', (_e, slug, rel) => skillStudio.deleteFile(slug, rel))
  handle('skillStudio:getSettings', (_e, slug) => skillStudio.readSettings(slug))
  handle('skillStudio:setSetting', (_e, slug, key, value) =>
    skillStudio.writeSetting(slug, key, value)
  )
  handle('skillStudio:readChats', (_e, slug) => skillStudio.readChats(slug))
  handle('skillStudio:saveAuthChat', (_e, slug, chat) => skillStudio.saveAuthChat(slug, chat))
  handle('skillStudio:saveTestChat', (_e, slug, chat) => skillStudio.saveTestChat(slug, chat))
  handle('skillStudio:archiveTest', (_e, slug, chat) => skillStudio.archiveTest(slug, chat))

  // fire and forget; progress streams back over skillStudio:event
  handle('skillStudio:test', (_e, slug, prompt, display) => {
    studioAgent.test(slug, prompt, display).catch((err) => {
      emitEvent(win.webContents, 'skillStudio:event', {
        kind: 'status',
        docId: slug,
        status: 'error',
        detail: err instanceof Error ? err.message : String(err)
      })
    })
  })
  handle('skillStudio:resetTest', (_e, slug) => studioAgent.resetTest(slug))
  handle('skillStudio:interruptTest', (_e, slug) => studioAgent.interrupt(slug))
  handle('skillStudio:testBusy', (_e, slug) => studioAgent.isBusy(slug))

  handle('skillStudio:authSend', (_e, slug, prompt, display) => {
    studioAgent.authSend(slug, prompt, display).catch((err) => {
      emitEvent(win.webContents, 'skillStudio:authEvent', {
        kind: 'status',
        docId: slug,
        status: 'error',
        detail: err instanceof Error ? err.message : String(err)
      })
    })
  })
  handle('skillStudio:authInterrupt', (_e, slug) => studioAgent.authInterrupt(slug))
  handle('skillStudio:authBusy', (_e, slug) => studioAgent.authBusy(slug))
  // a real reset is two writes: rotate the SDK session (main) AND clear the persisted
  // transcript + resume id (disk) — clearing only the visible chat would resume the old session
  handle('skillStudio:resetAuth', async (_e, slug) => {
    await studioAgent.resetAuth(slug)
    await skillStudio.resetAuthChat(slug)
  })

  handle('skillStudio:changes', (_e, slug) => studioVcs.changes(slug))
  handle('skillStudio:diff', (_e, slug, rel, scope) => studioVcs.diff(slug, rel, scope))
  handle('skillStudio:stage', (_e, slug, rel) => studioVcs.stage(slug, rel))
  handle('skillStudio:stageAll', (_e, slug) => studioVcs.stageEverything(slug))
  handle('skillStudio:unstage', (_e, slug, rel) => studioVcs.unstage(slug, rel))
  handle('skillStudio:unstageAll', (_e, slug) => studioVcs.unstageEverything(slug))
  handle('skillStudio:discard', (_e, slug, rel) => studioVcs.discard(slug, rel))
  handle('skillStudio:discardAll', (_e, slug) => studioVcs.discardEverything(slug))
  handle('skillStudio:commit', (_e, slug) => studioVcs.commit(slug))

  onSend('skillStudio:permission-response', (_e, requestId, approved, answers) => {
    studioAgent.resolvePermission(requestId, approved, answers)
  })
}

function registerAgent(win: BrowserWindow): void {
  agentManager.attach(win.webContents)

  handle('agent:send', (_e, id, prompt, opts) => {
    // fire and forget; progress flows back over agent:event
    agentManager.send(id, prompt, opts).catch((err) => {
      emitEvent(win.webContents, 'agent:event', {
        kind: 'status',
        docId: id,
        status: 'error',
        detail: err instanceof Error ? err.message : String(err)
      })
    })
  })
  handle('agent:interrupt', (_e, id) => agentManager.interrupt(id))
  handle('agent:busy', (_e, id) => agentManager.isBusy(id))
  handle('agent:models', () => agentManager.listModels())
  // warm the cache so the picker is populated by the time a doc is open
  void agentManager.listModels()
  onSend('agent:permission-response', (_e, requestId, approved, answers) => {
    agentManager.resolvePermission(requestId, approved, answers)
  })
}
