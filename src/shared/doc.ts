// The on-disk contract for a document project, shared by every layer so the
// file names and the "what is this file" predicates live in exactly one place.
// Before this module the manuscript name 'document.md' was hardcoded at five
// renderer sites and the managed-file name 'comments.json' was forked privately
// inside toolPolicy.ts — renaming either silently broke a consumer.

/** The manuscript: the document the author is actually writing. */
export const DOC_FILE = 'document.md'

/** App-managed sidecar the agent must never edit directly (the app records replies). */
export const COMMENTS_FILE = 'comments.json'

/** True when a tool/permission targets the primary manuscript (drives inline suggestions, labels). */
export function isPrimaryDoc(filePath: string | undefined | null): boolean {
  return filePath === DOC_FILE
}

/** True when a doc-relative path is an app-managed file the agent must not write. */
export function isManagedFile(relPath: string | undefined | null): boolean {
  return relPath === COMMENTS_FILE
}
