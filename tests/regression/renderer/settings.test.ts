import { afterEach, describe, expect, it, vi } from 'vitest'
import { freshStore, makeFabulist } from '../../helpers/store'
import { FALLBACK_MODEL_CHOICES } from '@shared/types'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

const DOC = 'doc'

// Characterization: per-document settings (model / font / auto-approve) and the
// engine 'default' → '' model sentinel. Theme 6 makes settings generic and Theme 7
// centralizes the sentinel; the observable store behavior pinned here must hold.

describe('settings slice', () => {
  it('starts from the static fallback model choices', async () => {
    const { useStore } = await freshStore()
    expect(useStore.getState().models).toEqual(FALLBACK_MODEL_CHOICES)
    expect(useStore.getState().model).toBe('')
  })

  it('folds the engine "default" row into the empty-string sentinel', async () => {
    const fab = makeFabulist({
      agent: {
        models: vi.fn(async () => [
          { value: 'default', label: 'Default (CLI)', hint: 'cli picks' },
          { value: 'opus', label: 'Opus', hint: 'deep' }
        ])
      }
    })
    const { useStore } = await freshStore(fab)
    await useStore.getState().loadModels()
    expect(useStore.getState().models).toEqual([
      { value: '', label: 'Default (CLI)', hint: 'cli picks' },
      { value: 'opus', label: 'Opus', hint: 'deep' }
    ])
  })

  it('keeps the fallback list when the engine returns nothing', async () => {
    const { useStore } = await freshStore()
    await useStore.getState().loadModels()
    expect(useStore.getState().models).toEqual(FALLBACK_MODEL_CHOICES)
  })

  it('persists model / font / auto-approve for the active document', async () => {
    const fab = makeFabulist()
    const { useStore } = await freshStore(fab)
    useStore.setState({ activeId: DOC })

    useStore.getState().setModel('sonnet')
    useStore.getState().setFont('fraunces')
    useStore.getState().setAutoApprove(true)

    const s = useStore.getState()
    expect(s.model).toBe('sonnet')
    expect(s.font).toBe('fraunces')
    expect(s.autoApprove).toBe(true)
    expect(fab.doc.setSetting).toHaveBeenCalledWith(DOC, 'model', 'sonnet')
    expect(fab.doc.setSetting).toHaveBeenCalledWith(DOC, 'font', 'fraunces')
    expect(fab.doc.setSetting).toHaveBeenCalledWith(DOC, 'autoApprove', true)
  })

  it('ignores setting changes when no document is open', async () => {
    const fab = makeFabulist()
    const { useStore } = await freshStore(fab)
    useStore.getState().setModel('sonnet')
    expect(fab.doc.setSetting).not.toHaveBeenCalled()
    expect(useStore.getState().model).toBe('')
  })
})
