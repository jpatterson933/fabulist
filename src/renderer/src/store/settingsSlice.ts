import type { StateCreator } from 'zustand'
import { DEFAULT_FONT, DEFAULT_MODEL_CHOICE, FALLBACK_MODEL_CHOICES } from '@shared/types'
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
    window.fabulist.doc.setModel(id, model).catch(() => {})
  },

  setAutoApprove: (on) => {
    const id = get().activeId
    if (!id) return
    set({ autoApprove: on })
    window.fabulist.doc.setAutoApprove(id, on).catch(() => {})
  },

  setFont: (font) => {
    const id = get().activeId
    if (!id) return
    set({ font })
    window.fabulist.doc.setFont(id, font).catch(() => {})
  },

  loadModels: async () => {
    const fromEngine = await window.fabulist.agent.models().catch(() => [])
    if (fromEngine.length === 0) return
    // the engine lists its own "default" row; fold it into our '' sentinel
    // ('' = omit the model option entirely, letting the CLI pick its default)
    const engineDefault = fromEngine.find((m) => m.value === 'default')
    const rest = fromEngine.filter((m) => m.value !== 'default')
    const defaultChoice = engineDefault
      ? { value: '', label: engineDefault.label, hint: engineDefault.hint }
      : DEFAULT_MODEL_CHOICE
    set({ models: [defaultChoice, ...rest] })
  }
})
