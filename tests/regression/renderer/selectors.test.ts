import { describe, expect, it } from 'vitest'
import { selectChat, selectTestChat } from '@/store/selectors'
import type { Store } from '@/store/types'
import type { ChatItem } from '@shared/types'

// Guards the Zustand v5 + React 19 footgun that blanked the screen: a useStore
// selector MUST return a reference-stable value when nothing changed. A doc with
// no chat yet must not yield a fresh [] each call, or useSyncExternalStore loops
// ("Maximum update depth exceeded").

const state = (chats: Record<string, ChatItem[]>): Store => ({ chats }) as unknown as Store

describe('selectChat', () => {
  it('returns the SAME empty array reference when the doc has no chat', () => {
    const s = state({})
    expect(selectChat('missing')(s)).toBe(selectChat('missing')(s))
  })

  it('returns the document chat array by reference when present', () => {
    const chat: ChatItem[] = [{ id: 'm', role: 'user', text: 'hi', at: 0 }]
    const s = state({ doc: chat })
    expect(selectChat('doc')(s)).toBe(chat)
  })
})

const testState = (testChats: Record<string, ChatItem[]>): Store =>
  ({ testChats }) as unknown as Store

describe('selectTestChat', () => {
  it('returns the SAME empty array reference when the skill has no test chat', () => {
    const s = testState({})
    expect(selectTestChat('missing')(s)).toBe(selectTestChat('missing')(s))
  })

  it('returns the skill test chat array by reference when present', () => {
    const chat: ChatItem[] = [{ id: 'm', role: 'user', text: 'hi', at: 0 }]
    const s = testState({ skill: chat })
    expect(selectTestChat('skill')(s)).toBe(chat)
  })
})
