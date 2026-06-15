import { describe, expect, it } from 'vitest'
import { formatTestVersion } from '@shared/testVersion'

// The test odometer: starts at 0.0.1, each of minor/patch rolls 0→9 and carries.
describe('formatTestVersion', () => {
  it('renders the odometer with carries', () => {
    expect(formatTestVersion(1)).toBe('0.0.1')
    expect(formatTestVersion(9)).toBe('0.0.9')
    expect(formatTestVersion(10)).toBe('0.1.0') // patch carries into minor
    expect(formatTestVersion(11)).toBe('0.1.1')
    expect(formatTestVersion(99)).toBe('0.9.9')
    expect(formatTestVersion(100)).toBe('1.0.0') // minor carries into major
    expect(formatTestVersion(101)).toBe('1.0.1')
  })

  it('floors to the first version for non-positive input', () => {
    expect(formatTestVersion(0)).toBe('0.0.1')
    expect(formatTestVersion(-5)).toBe('0.0.1')
  })
})
