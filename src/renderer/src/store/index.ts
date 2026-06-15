import { create } from 'zustand'
import type { Store } from './types'
import { createDocSlice } from './docSlice'
import { createCommentsSlice } from './commentsSlice'
import { createChatSlice } from './chatSlice'
import { createPermissionsSlice } from './permissionsSlice'
import { createSettingsSlice } from './settingsSlice'
import { createHistorySlice } from './historySlice'
import { createErrorsSlice } from './errorsSlice'
import { createSkillStudioSlice } from './skillStudioSlice'

export type { Store, SidebarTab, DraftComment, AgentState, AppMode } from './types'

// One store, composed from focused slices. Every slice receives the shared
// (set, get), so cross-slice calls (e.g. the chat reducer reloading history or
// re-anchoring comments) still resolve against the whole store.
export const useStore = create<Store>()((...a) => ({
  ...createDocSlice(...a),
  ...createCommentsSlice(...a),
  ...createChatSlice(...a),
  ...createPermissionsSlice(...a),
  ...createSettingsSlice(...a),
  ...createHistorySlice(...a),
  ...createErrorsSlice(...a),
  ...createSkillStudioSlice(...a)
}))
