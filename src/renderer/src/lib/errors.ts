import { useStore } from '@/store'

// The single import for wiring error handling into renderer code. Adding error
// handling to a new place is `import { reporter } from '@/lib/errors'` and
// `.catch(reporter('what failed'))` — no new mechanism, no extra state. All of
// these funnel into the store's reportError policy (store/errorsSlice.ts).

/** Report an error imperatively (e.g. in a try/catch outside a React component). */
export function reportError(e: unknown, context?: string): void {
  useStore.getState().reportError(e, context)
}

/** A ready-made `.catch` handler: `promise.catch(reporter('Loading skills'))`. */
export function reporter(context: string): (e: unknown) => void {
  return (e) => reportError(e, context)
}

/**
 * Route uncaught renderer errors and unhandled promise rejections into the same
 * reporting path. Called once at startup (see store/bootstrap.ts). The
 * console.error lands in the terminal via the main-process diagnostics bridge.
 */
export function installErrorReporting(): void {
  window.addEventListener('error', (e) =>
    console.error('[renderer error]', e.message, e.error?.stack ?? '')
  )
  window.addEventListener('unhandledrejection', (e) =>
    console.error('[unhandled rejection]', e.reason)
  )
}
