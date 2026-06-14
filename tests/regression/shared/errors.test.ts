import { describe, expect, it } from 'vitest'
import { errorMessage, describeError } from '@shared/errors'

describe('errorMessage', () => {
  it('reads Error.message', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
  })
  it('passes a string through', () => {
    expect(errorMessage('plain')).toBe('plain')
  })
  it('strips the Electron IPC wrapper', () => {
    expect(
      errorMessage(new Error("Error invoking remote method 'doc:read': Error: ENOENT no such file"))
    ).toBe('ENOENT no such file')
  })
  it('stringifies non-error values', () => {
    expect(errorMessage(42)).toBe('42')
  })
})

describe('describeError', () => {
  it('prefixes with the context', () => {
    expect(describeError('Saving your changes', new Error('disk full'))).toBe(
      'Saving your changes: disk full'
    )
  })
  it('omits the prefix when no context is given', () => {
    expect(describeError(undefined, 'x')).toBe('x')
  })
})
