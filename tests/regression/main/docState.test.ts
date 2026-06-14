import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTempDir } from '../../helpers/temp'

// Characterization: the per-document state blob (sessionId / chat / model / font /
// autoApprove) read and written under .fabulist/state.json. Theme 6 splits this
// into a typed settings store + an agent session store; the merge/round-trip
// semantics pinned here must be preserved by whatever replaces patchState.

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('electron')
})

async function loadLibrary(documentsRoot: string) {
  vi.doMock('electron', () => ({
    app: { getPath: () => documentsRoot },
    dialog: { showOpenDialog: vi.fn() }
  }))
  return import('../../../src/main/library')
}

describe('per-document state', () => {
  it('returns an empty object for a document with no state yet', async () => {
    const root = await makeTempDir('fabulist-state-empty-')
    const library = await loadLibrary(root)
    expect(await library.readState('doc')).toEqual({})
  })

  it('round-trips a written patch', async () => {
    const root = await makeTempDir('fabulist-state-rt-')
    const library = await loadLibrary(root)
    await library.patchState('doc', { model: 'opus' })
    expect(await library.readState('doc')).toEqual({ model: 'opus' })
  })

  it('merges successive patches without dropping earlier keys', async () => {
    const root = await makeTempDir('fabulist-state-merge-')
    const library = await loadLibrary(root)
    await library.patchState('doc', { model: 'opus' })
    await library.patchState('doc', { sessionId: 's1' })
    await library.patchState('doc', { autoApprove: true, font: 'literata' })
    expect(await library.readState('doc')).toEqual({
      model: 'opus',
      sessionId: 's1',
      autoApprove: true,
      font: 'literata'
    })
  })

  it('overwrites a key when patched again', async () => {
    const root = await makeTempDir('fabulist-state-ow-')
    const library = await loadLibrary(root)
    await library.patchState('doc', { model: 'opus' })
    await library.patchState('doc', { model: 'sonnet' })
    expect((await library.readState('doc')).model).toBe('sonnet')
  })
})

describe('typed settings layer', () => {
  it('applies defaults for an unconfigured document', async () => {
    const root = await makeTempDir('fabulist-settings-def-')
    const library = await loadLibrary(root)
    expect(await library.readSettings('doc')).toEqual({ model: '', font: 'newsreader', autoApprove: false })
  })

  it('round-trips a written setting and strips empty values back to default', async () => {
    const root = await makeTempDir('fabulist-settings-rt-')
    const library = await loadLibrary(root)
    await library.writeSetting('doc', 'model', 'opus')
    await library.writeSetting('doc', 'autoApprove', true)
    expect(await library.readSettings('doc')).toMatchObject({ model: 'opus', autoApprove: true })

    await library.writeSetting('doc', 'model', '') // empty → unset → default
    expect((await library.readSettings('doc')).model).toBe('')
    await library.writeSetting('doc', 'autoApprove', false)
    expect((await library.readSettings('doc')).autoApprove).toBe(false)
  })

  it('does not mingle settings with the agent session/transcript', async () => {
    const root = await makeTempDir('fabulist-settings-sep-')
    const library = await loadLibrary(root)
    await library.patchState('doc', { sessionId: 's1', chat: [{ id: 'm', role: 'user', text: 'hi', at: 0 }] })
    await library.writeSetting('doc', 'model', 'opus')
    const state = await library.readState('doc')
    expect(state.sessionId).toBe('s1')
    expect(await library.readSettings('doc')).toMatchObject({ model: 'opus' })
  })

  it('validates the transcript on read, dropping malformed items', async () => {
    const root = await makeTempDir('fabulist-chat-')
    const library = await loadLibrary(root)
    await library.patchState('doc', {
      // mix of valid and junk; only the well-formed item survives
      chat: [
        { id: 'a', role: 'user', text: 'ok', at: 1 },
        { role: 'user', text: 'no id' },
        null,
        'garbage'
      ] as unknown as never
    })
    const chat = await library.readChat('doc')
    expect(chat).toHaveLength(1)
    expect(chat[0].id).toBe('a')
  })
})
