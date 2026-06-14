import { describe, expect, it, vi } from 'vitest'
import type { PermissionRequest } from '../../../src/shared/types'
import { PermissionBroker } from '../../../src/main/permissionBroker'

function request(docId: string, requestId: string): PermissionRequest {
  return {
    requestId,
    docId,
    tool: 'Bash',
    summary: 'Run command'
  }
}

describe('permission broker', () => {
  it('clears only the pending requests for the finished document', () => {
    const broker = new PermissionBroker()
    const resolveA = vi.fn()
    const resolveB = vi.fn()

    broker.add(request('a', 'req-a'), resolveA)
    broker.add(request('b', 'req-b'), resolveB)

    expect(broker.clearDoc('a')).toEqual(['req-a'])
    expect(resolveA).toHaveBeenCalledWith(false)
    expect(resolveB).not.toHaveBeenCalled()
    expect(broker.requestsForDoc('b').map((r) => r.requestId)).toEqual(['req-b'])

    expect(broker.resolve('req-b', true)).toBe(true)
    expect(resolveB).toHaveBeenCalledWith(true, undefined)
    expect(broker.size).toBe(0)
  })
})
