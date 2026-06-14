import type { ModelChoice } from './types'
import { DEFAULT_MODEL_CHOICE } from './types'

// The model selection has a three-value protocol that used to be decoded in
// scattered places: the renderer showed the engine's 'default' row, stored ''
// for it, and main re-encoded '' → undefined in two spots. It now lives here.

/** Sentinel: no explicit model — let the Claude Code CLI pick its own default. */
export const DEFAULT_MODEL = ''

/** Map a stored model setting to the SDK / persistence argument (sentinel → undefined). */
export function toModelArg(model: string | undefined): string | undefined {
  return model || undefined
}

/** Fold the engine's own 'default' row into our '' sentinel so the picker has one default. */
export function normalizeModelChoices(fromEngine: ModelChoice[]): ModelChoice[] {
  const engineDefault = fromEngine.find((m) => m.value === 'default')
  const rest = fromEngine.filter((m) => m.value !== 'default')
  const defaultChoice = engineDefault
    ? { value: DEFAULT_MODEL, label: engineDefault.label, hint: engineDefault.hint }
    : DEFAULT_MODEL_CHOICE
  return [defaultChoice, ...rest]
}
