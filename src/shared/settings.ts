import { DEFAULT_FONT } from './types'

// Per-document user settings, declared once. Adding a setting used to mean ~9
// coordinated edits across 5 files (a bespoke get/set channel pair, preload
// methods, a store field+action, an openDoc fetch, and a UI control). Now the
// contract is one entry here + a generic getSettings/setSetting channel pair,
// so a new setting is one line below plus its UI control. These are distinct
// from the agent's session/transcript (sessionId, chat), which live separately.

export interface DocSettings {
  /** Claude Code model alias/id; '' = let the CLI pick its default */
  model: string
  /** editor typeface for this document */
  font: string
  /** apply Claude's file edits without an approval card (Bash still asks) */
  autoApprove: boolean
}

export type SettingKey = keyof DocSettings

/** Authoritative defaults, applied by the main process when a value is unset. */
export const SETTING_DEFAULTS: DocSettings = {
  model: '',
  font: DEFAULT_FONT,
  autoApprove: false
}

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[]
