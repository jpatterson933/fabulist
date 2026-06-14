import type { ChatItem } from '@shared/types'
import type { Store } from './types'

// Derived store selectors. The rule these enforce: a selector passed to useStore
// must return a REFERENCE-STABLE value when nothing changed, or Zustand v5 +
// React 19's useSyncExternalStore re-renders forever ("Maximum update depth
// exceeded"). Defaulting with `?? []` inline breaks that — every call makes a
// new array. Keep the shared empties here and unit-test their stability.

const NO_CHAT: ChatItem[] = []

/** A document's chat transcript, or a stable empty array when it has none yet. */
export const selectChat =
  (docId: string) =>
  (s: Store): ChatItem[] =>
    s.chats[docId] ?? NO_CHAT
