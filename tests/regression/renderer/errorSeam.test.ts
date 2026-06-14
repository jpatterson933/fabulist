import { afterEach, describe, expect, it, vi } from 'vitest'
import { freshStore, makeFabulist, flush } from '../../helpers/store'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

const DOC = 'doc'

// A failed manuscript save used to be swallowed by `.catch(() => {})`; it now
// flows to the reportError seam so the UI can surface it.

describe('error reporting seam', () => {
  it('reports a failed flushWrite instead of swallowing it', async () => {
    const fab = makeFabulist({
      doc: { write: vi.fn(async () => { throw new Error('disk full') }) }
    })
    const { useStore } = await freshStore(fab)
    useStore.setState({ activeId: DOC, content: 'old' })
    useStore.getState().setContent('new') // schedules the debounced write
    await useStore.getState().flushWrite() // forces it now; the write rejects
    await flush()
    const lastError = useStore.getState().lastError
    expect(lastError).toContain('disk full')
    expect(lastError).toContain('Couldn’t save your changes') // context prefix from the shared formatter
  })

  it('reportError formats with context and dismissError clears the banner', async () => {
    const { useStore } = await freshStore()
    useStore.getState().reportError(new Error('boom'), 'Doing the thing')
    expect(useStore.getState().lastError).toBe('Doing the thing: boom')
    useStore.getState().dismissError()
    expect(useStore.getState().lastError).toBeNull()
  })
})
