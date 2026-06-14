import { describe, expect, it } from 'vitest'
import { DOC_FILE, COMMENTS_FILE, isPrimaryDoc, isManagedFile } from '@shared/doc'
import { DEFAULT_MODEL, toModelArg, normalizeModelChoices } from '@shared/model'

// Guards the shared cross-process contract: one home for the document/managed
// file names (closing the toolPolicy comments.json fork) and the model sentinel.

describe('doc file contract', () => {
  it('exposes the canonical file names', () => {
    expect(DOC_FILE).toBe('document.md')
    expect(COMMENTS_FILE).toBe('comments.json')
  })

  it('isPrimaryDoc is true only for the manuscript', () => {
    expect(isPrimaryDoc(DOC_FILE)).toBe(true)
    expect(isPrimaryDoc('notes.md')).toBe(false)
    expect(isPrimaryDoc(undefined)).toBe(false)
  })

  it('isManagedFile is true only for the agent-protected sidecar', () => {
    expect(isManagedFile(COMMENTS_FILE)).toBe(true)
    expect(isManagedFile(DOC_FILE)).toBe(false)
    expect(isManagedFile(undefined)).toBe(false)
  })
})

describe('model sentinel', () => {
  it('maps the sentinel to undefined and a real value through unchanged', () => {
    expect(DEFAULT_MODEL).toBe('')
    expect(toModelArg('')).toBeUndefined()
    expect(toModelArg(undefined)).toBeUndefined()
    expect(toModelArg('opus')).toBe('opus')
  })

  it('folds the engine default row into the sentinel', () => {
    expect(
      normalizeModelChoices([
        { value: 'default', label: 'Default', hint: 'h' },
        { value: 'opus', label: 'Opus', hint: 'deep' }
      ])
    ).toEqual([
      { value: '', label: 'Default', hint: 'h' },
      { value: 'opus', label: 'Opus', hint: 'deep' }
    ])
  })

  it('uses the static default choice when the engine omits a default row', () => {
    const out = normalizeModelChoices([{ value: 'opus', label: 'Opus', hint: 'deep' }])
    expect(out[0].value).toBe('')
    expect(out[1]).toEqual({ value: 'opus', label: 'Opus', hint: 'deep' })
  })
})
