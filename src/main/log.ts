import type { BrowserWindow } from 'electron'
import { describeError } from '@shared/errors'
import type { AgentEvent } from '@shared/types'

// The single home for main-process error/diagnostics policy. `logError` is the
// main-side equivalent of the renderer's reportError; `attachDiagnostics` pipes
// renderer-side failures into this same terminal; `toolActivityLogger` /
// `logToolDenied` surface agent tool calls + their outcomes there too.

/** Log a caught main-process error with context (replaces silent `.catch(() => {})`). */
export function logError(context: string, e: unknown): void {
  console.error('[error]', describeError(context, e))
}

/**
 * A per-run tool-activity logger for the server console: tag each agent's tool
 * call with `scope` (e.g. "skill-test copywright") when it starts and again when
 * it finishes — ✓ / ✗ — so a run's tool use, including silent failures, is
 * visible where `npm run dev` runs. It reads the `tool-note` events the SDK
 * stream already yields (start carries the human summary; the matching result
 * carries only the tool id + ok flag), correlating the two by tool id so the
 * outcome line still names what ran. Stateful, so create one per run.
 */
export function toolActivityLogger(scope: string): (event: AgentEvent) => void {
  const summaries = new Map<string, string>()
  return (event) => {
    if (event.kind !== 'tool-note') return
    if (!event.done) {
      if (!event.note) return
      summaries.set(event.toolId, event.note)
      console.log(`[tool] ${scope} · ${event.note}`)
    } else {
      const summary = summaries.get(event.toolId) ?? event.toolId
      summaries.delete(event.toolId)
      console.log(`[tool] ${scope} · ${summary} → ${event.ok === false ? '✗ error' : '✓ ok'}`)
    }
  }
}

/**
 * Log a tool call the approval gate refused, with the reason (path escape outside
 * the project, an app-managed file, …). The stream only reports these as a generic
 * error after the fact; the actual reason is known only here, at the gate.
 */
export function logToolDenied(scope: string, tool: string, reason: string): void {
  console.log(`[tool] ${scope} · ${tool} ✗ denied: ${reason}`)
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
