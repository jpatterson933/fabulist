import type { ActionSurface } from '@shared/harness'

// Action surfaces as a registry: each row says when a surface is available,
// what context it contributes to the agent prompt, and how the palette hints
// it. Adding a surface (say, "comment" or "panel") is a row here plus the
// enum value in the schema descriptor — runAction and the palette pick it up.

/** the slice of store state a surface may consult */
export interface SurfaceState {
  selectionQuote: string | null
}

export interface SurfaceSpec {
  id: ActionSurface
  /** shown next to the action in the ⌘K palette */
  hint: (available: boolean) => string | undefined
  /** can the action run right now? quoteOverride counts for selection */
  available: (state: SurfaceState, quoteOverride?: string) => boolean
  /** the quoted text to attach, if the surface carries one */
  quote: (state: SurfaceState, quoteOverride?: string) => string | undefined
  /** extra instruction appended to the composed prompt */
  framing?: string
}

export const SURFACES: Record<ActionSurface, SurfaceSpec> = {
  selection: {
    id: 'selection',
    hint: (available) => (available ? 'on selection' : 'select text first'),
    available: (s, quoteOverride) => Boolean(quoteOverride ?? s.selectionQuote),
    quote: (s, quoteOverride) => quoteOverride ?? s.selectionQuote ?? undefined
  },
  file: {
    id: 'file',
    hint: () => 'on this file',
    available: () => true,
    quote: () => undefined,
    framing: 'Apply this to the file the user is currently focused on.'
  },
  project: {
    id: 'project',
    hint: () => undefined,
    available: () => true,
    quote: () => undefined
  }
}
