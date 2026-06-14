import type { StateCreator } from 'zustand'
import { DEFAULT_FONT, FALLBACK_MODEL_CHOICES } from '@shared/types'
import { normalizeModelChoices } from '@shared/model'
import type { SettingsSlice, Store } from './types'

export const createSettingsSlice: StateCreator<Store, [], [], SettingsSlice> = (set, get) => ({
  model: '',
  models: FALLBACK_MODEL_CHOICES,
  autoApprove: false,
  font: DEFAULT_FONT,

  setModel: (model) => {
    const id = get().activeId
    if (!id) return
    set({ model })
    window.fabulist.doc.setSetting(id, 'model', model).catch(() => {})
  },

  setAutoApprove: (on) => {
    const id = get().activeId
    if (!id) return
    set({ autoApprove: on })
    window.fabulist.doc.setSetting(id, 'autoApprove', on).catch(() => {})
  },

  setFont: (font) => {
    const id = get().activeId
    if (!id) return
    set({ font })
    window.fabulist.doc.setSetting(id, 'font', font).catch(() => {})
  },

  applySettings: (settings) => {
    set({ model: settings.model, font: settings.font || DEFAULT_FONT, autoApprove: settings.autoApprove })
  },

  loadSettings: async (id) => {
    get().applySettings(await window.fabulist.doc.getSettings(id))
  },

  loadModels: async () => {
    const fromEngine = await window.fabulist.agent.models().catch(() => [])
    if (fromEngine.length === 0) return
    set({ models: normalizeModelChoices(fromEngine) })
  }
})
