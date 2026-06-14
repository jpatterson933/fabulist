import { afterEach, describe, expect, it, vi } from 'vitest'
import { Debouncer } from '../../../src/main/debounce'

afterEach(() => {
  vi.useRealTimers()
})

describe('Debouncer', () => {
  it('collapses rapid calls for the same key into one trailing run', () => {
    vi.useFakeTimers()
    const d = new Debouncer(150)
    const fn = vi.fn()
    d.run('a', fn)
    d.run('a', fn)
    d.run('a', fn)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(150)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('debounces distinct keys independently', () => {
    vi.useFakeTimers()
    const d = new Debouncer(100)
    const a = vi.fn()
    const b = vi.fn()
    d.run('a', a)
    d.run('b', b)
    vi.advanceTimersByTime(100)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('clear() cancels everything pending', () => {
    vi.useFakeTimers()
    const d = new Debouncer(100)
    const fn = vi.fn()
    d.run('a', fn)
    d.clear()
    vi.advanceTimersByTime(500)
    expect(fn).not.toHaveBeenCalled()
  })
})
