import type { CommentThread } from '@shared/types'
import { locateAnchor } from '@/lib/anchors'

let extSeq = 1

/**
 * Monotonic sequence stamp for editor-facing signals (external content
 * replaces, scroll-to requests). The editor applies a signal only when its seq
 * exceeds the last one it handled, so re-emitting the same value still fires.
 */
export function nextSeq(): number {
  return extSeq++
}

/** Re-anchor stored threads against current content; returns updated copies. */
export function reanchor(threads: CommentThread[], content: string): CommentThread[] {
  return threads.map((t) => {
    if (t.status === 'resolved') return t
    const loc = locateAnchor(content, t.anchor)
    if (!loc) return { ...t, status: 'orphaned' as const }
    return {
      ...t,
      status: t.status === 'orphaned' ? ('open' as const) : t.status,
      anchor: { ...t.anchor, from: loc.from, to: loc.to }
    }
  })
}
