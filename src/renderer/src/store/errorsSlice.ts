import type { StateCreator } from 'zustand'
import { describeError } from '@shared/errors'
import type { ErrorsSlice, Store } from './types'

/**
 * The single home for renderer error policy: what happens when any part of the
 * app reports an error. Today that's "log it (forwarded to the terminal) and
 * show a dismissible banner." To add telemetry, severity, or a different
 * surface, change `reportError` here — every call site updates at once.
 */
export const createErrorsSlice: StateCreator<Store, [], [], ErrorsSlice> = (set) => ({
  lastError: null,

  reportError: (e, context) => {
    const message = describeError(context, e)
    console.error('[error]', message, e)
    set({ lastError: message })
  },

  dismissError: () => set({ lastError: null })
})
