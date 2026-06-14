// The one place error messages are normalized, used by both processes. Before
// this, `errText` was inlined in the store and SkillsPanel carried its own regex
// to strip Electron's IPC wrapper — so "what does an error look like" lived in
// two spots. Change formatting here and every reporter updates.

/** Normalize any thrown value to a clean, human-readable message. */
export function errorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : String(e)
  // Electron wraps IPC failures as: Error invoking remote method '<channel>': Error: <real>
  // (the channel itself can contain a colon, e.g. 'doc:read', so match it as a quoted run)
  const stripped = raw.replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, '').trim()
  return stripped || raw
}

/** A message prefixed with what was being attempted, e.g. "Saving your changes: disk full". */
export function describeError(context: string | undefined, e: unknown): string {
  const msg = errorMessage(e)
  return context ? `${context}: ${msg}` : msg
}
