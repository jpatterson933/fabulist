import type { StateCreator } from 'zustand'
import type { PermissionsSlice, Store } from './types'

export const createPermissionsSlice: StateCreator<Store, [], [], PermissionsSlice> = (set, get) => ({
  permissions: [],
  inlineSuggestionId: null,

  respondPermission: (requestId, approved, answers) => {
    window.fabulist.agent.respondPermission(requestId, approved, answers)
  },

  setInlineSuggestion: (requestId) => {
    if (get().inlineSuggestionId !== requestId) set({ inlineSuggestionId: requestId })
  }
})
