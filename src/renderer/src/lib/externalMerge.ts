/**
 * Compute the minimal single-span replacement that turns `prev` into `next`,
 * by trimming the common prefix and suffix. Dispatching this instead of a
 * whole-document replace lets CodeMirror map scroll position and selection
 * through the change, so external edits don't yank the viewport around.
 */
export function minimalReplace(
  prev: string,
  next: string
): { from: number; to: number; insert: string } | null {
  if (prev === next) return null
  let start = 0
  const maxStart = Math.min(prev.length, next.length)
  while (start < maxStart && prev[start] === next[start]) start++
  let endPrev = prev.length
  let endNext = next.length
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
    endPrev--
    endNext--
  }
  return { from: start, to: endPrev, insert: next.slice(start, endNext) }
}
