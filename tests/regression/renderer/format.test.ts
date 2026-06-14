import { describe, expect, it } from 'vitest'
import { truncate, relativeTime } from '@/lib/format'

describe('truncate', () => {
  it('leaves short strings untouched', () => {
    expect(truncate('hello', 10)).toBe('hello')
  })
  it('clips and ellipsizes long strings', () => {
    expect(truncate('hello world', 5)).toBe('hello…')
  })
})

describe('relativeTime', () => {
  const now = Date.now()
  it('says "just now" for the current minute', () => {
    expect(relativeTime(now)).toBe('just now')
  })
  it('reports minutes and hours ago', () => {
    expect(relativeTime(now - 5 * 60_000)).toBe('5m ago')
    expect(relativeTime(now - 3 * 3_600_000)).toBe('3h ago')
  })
  it('reports days ago within a month', () => {
    expect(relativeTime(now - 4 * 86_400_000)).toBe('4d ago')
  })
})
