import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('askClaude write ordering', () => {
  it('waits for a pending document write before sending the prompt', async () => {
    let finishWrite!: () => void
    const write = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = resolve
        })
    )
    const send = vi.fn(() => Promise.resolve())

    vi.stubGlobal('window', {
      fabulist: {
        doc: { write },
        agent: { send }
      }
    })

    const { useStore } = await import('../../../src/renderer/src/store')

    useStore.setState({ activeId: 'doc', content: '# Old\n\n' })
    useStore.getState().setContent('# New\n\n')

    const sent = useStore.getState().askClaude('read the latest draft')

    expect(write).toHaveBeenCalledWith('doc', '# New\n\n')
    expect(send).not.toHaveBeenCalled()

    finishWrite()
    await sent

    expect(send).toHaveBeenCalledWith('doc', 'read the latest draft', {})
  })
})
