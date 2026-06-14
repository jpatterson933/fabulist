// Small presentational formatters shared across components. Previously `truncate`
// was copy-pasted in ChatPanel and CommentsPanel, and `relativeTime` lived inside
// the Library component and was imported from there by CommentsPanel (a component
// importing a util from another component). They have a home here now.

/** Clip a string to `n` chars with an ellipsis. */
export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

/** Human "x ago" for a past timestamp (ms), falling back to a date past ~30 days. */
export function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}
