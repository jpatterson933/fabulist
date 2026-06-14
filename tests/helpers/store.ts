import { vi } from 'vitest'
import { makeAnchor } from '@/lib/anchors'
import type { CommentThread } from '@shared/types'

/**
 * A fully-stubbed `window.fabulist` bridge. Every method is a vi.fn() with a
 * harmless default; pass per-namespace overrides to assert on specific calls.
 */
export function makeFabulist(
  overrides: Partial<Record<string, Record<string, unknown>>> = {}
): Record<string, Record<string, ReturnType<typeof vi.fn>>> {
  const base: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {
    library: {
      list: vi.fn(async () => []),
      create: vi.fn(async () => ({ id: 'doc' })),
      remove: vi.fn(async () => {})
    },
    doc: {
      read: vi.fn(async () => ''),
      write: vi.fn(async () => {}),
      snapshot: vi.fn(async () => true),
      watch: vi.fn(async () => {}),
      chat: vi.fn(async () => []),
      getModel: vi.fn(async () => ''),
      setModel: vi.fn(async () => {}),
      getAutoApprove: vi.fn(async () => false),
      setAutoApprove: vi.fn(async () => {}),
      getFont: vi.fn(async () => ''),
      setFont: vi.fn(async () => {}),
      saveChat: vi.fn(async () => {})
    },
    history: {
      log: vi.fn(async () => []),
      show: vi.fn(async () => ''),
      restore: vi.fn(async () => '')
    },
    comments: {
      list: vi.fn(async () => []),
      add: vi.fn(async () => ({})),
      reply: vi.fn(async () => null),
      setStatus: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
      updateAnchors: vi.fn(async () => {})
    },
    agent: {
      send: vi.fn(async () => {}),
      interrupt: vi.fn(async () => {}),
      busy: vi.fn(async () => false),
      models: vi.fn(async () => []),
      respondPermission: vi.fn(() => {})
    }
  }
  for (const ns of Object.keys(overrides)) {
    base[ns] = { ...base[ns], ...overrides[ns] }
  }
  return base
}

/**
 * Stub `window` with a fresh fabulist mock, reset the module registry, and
 * import a clean store singleton. Pair with `afterEach` resetting globals.
 */
export async function freshStore(
  fabulist = makeFabulist()
): Promise<{ useStore: typeof import('../../src/renderer/src/store').useStore; fabulist: typeof fabulist }> {
  vi.stubGlobal('window', { fabulist })
  vi.resetModules()
  const mod = await import('../../src/renderer/src/store')
  return { useStore: mod.useStore, fabulist }
}

/** Let queued microtasks (fire-and-forget `void askClaude(...)`) settle. */
export function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** Build a CommentThread anchored to content[from..to]. */
export function makeThread(
  id: string,
  content: string,
  from: number,
  to: number,
  opts: { status?: CommentThread['status']; text?: string; messages?: CommentThread['messages'] } = {}
): CommentThread {
  return {
    id,
    anchor: makeAnchor(content, from, to),
    status: opts.status ?? 'open',
    createdAt: 0,
    messages: opts.messages ?? [{ id: `${id}-m1`, author: 'you', text: opts.text ?? 'comment', at: 0 }]
  }
}
