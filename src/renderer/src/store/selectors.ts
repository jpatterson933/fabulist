import type { ChatItem } from '@shared/types'
import type { Store, StudioComment } from './types'

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

const NO_TEST_CHAT: ChatItem[] = []

/** A skill's test-thread transcript, or a stable empty array when it has none yet. */
export const selectTestChat =
  (slug: string) =>
  (s: Store): ChatItem[] =>
    s.testChats[slug] ?? NO_TEST_CHAT

const NO_AUTH_CHAT: ChatItem[] = []

/** A skill's authoring-chat transcript, or a stable empty array when it has none yet. */
export const selectAuthChat =
  (slug: string) =>
  (s: Store): ChatItem[] =>
    s.authChats[slug] ?? NO_AUTH_CHAT

const NO_COMMENTS: StudioComment[] = []

/** A skill's comments, or a stable empty array when it has none yet. */
export const selectComments =
  (slug: string) =>
  (s: Store): StudioComment[] =>
    s.comments[slug] ?? NO_COMMENTS
