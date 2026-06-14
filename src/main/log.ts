import type { BrowserWindow } from 'electron'
import { describeError } from '@shared/errors'

// The single home for main-process error/diagnostics policy. `logError` is the
// main-side equivalent of the renderer's reportError; `attachDiagnostics` pipes
// renderer-side failures into this same terminal.

/** Log a caught main-process error with context (replaces silent `.catch(() => {})`). */
export function logError(context: string, e: unknown): void {
  console.error('[error]', describeError(context, e))
}

/**
 * Pipe renderer-side diagnostics into the main-process terminal (the "server
 * logs"). The renderer's own console and any uncaught error / preload failure
 * otherwise only appear in DevTools; this surfaces them where `npm run dev` runs.
 */
export function attachDiagnostics(win: BrowserWindow): void {
  const wc = win.webContents

  // A preload that throws never exposes window.fabulist — the #1 cause of a
  // "nothing happens on click" after the bridge changes.
  wc.on('preload-error', (_e, preloadPath, error) => {
    console.error('[preload-error]', preloadPath, error)
  })

  wc.on('render-process-gone', (_e, details) => {
    console.error('[render-process-gone]', details.reason, 'exitCode:', details.exitCode)
  })

  // Forward the renderer console (including console.error from uncaught errors
  // and unhandled rejections, see the renderer bootstrap). Electron's event
  // signature has shifted across versions, so read it defensively.
  wc.on('console-message', (...args: unknown[]) => {
    const first = args[0] as { level?: unknown; message?: unknown } | undefined
    const hasObj = first !== null && typeof first === 'object' && 'message' in first
    const message = hasObj ? first!.message : args[2]
    const level = hasObj ? first!.level : args[1]
    console.log(`[renderer${level !== undefined ? `:${String(level)}` : ''}]`, message)
  })
}
