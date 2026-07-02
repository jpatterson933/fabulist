import { app, BrowserWindow, net, protocol, shell } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isSafeRelPath } from '@shared/harness'
import { registerIpc } from './ipc'
import { commandManager } from './commands'
import { projectPath } from './library'

/**
 * fab-project://<projectId>/<relative/path> serves files straight out of a
 * project folder — how image and web panels (and their relative assets) load
 * without loosening webSecurity. Registered as a standard+secure scheme so
 * each project is its own origin and relative URLs resolve inside it.
 */
export const PROJECT_SCHEME = 'fab-project'

protocol.registerSchemesAsPrivileged([
  {
    scheme: PROJECT_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

function registerProjectProtocol(): void {
  protocol.handle(PROJECT_SCHEME, async (req) => {
    try {
      const url = new URL(req.url)
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
      // no traversal, no dotfiles (.fabulist state, .claude, .git stay private)
      if (!isSafeRelPath(rel)) return new Response('Forbidden', { status: 403 })
      const file = path.join(projectPath(url.hostname), ...rel.split('/'))
      return await net.fetch(pathToFileURL(file).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: '#f6f3ec',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  registerProjectProtocol()
  const win = createWindow()
  registerIpc(win)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

// studio command processes must not outlive the app
app.on('will-quit', () => {
  commandManager.stopAll()
})
