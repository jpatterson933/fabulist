import type { CommitInfo } from '@shared/types'
import { DOC_FILE } from '@shared/doc'
import * as git from './git'
import { docPath, writeDoc } from './library'

// Version operations for a document, composing git + the manuscript file. These
// used to live inline in IPC callbacks (notably the multi-step restore), where
// they were untestable and tangled the transport layer with versioning policy.

/** Commit the current working tree under a label; false when nothing changed. */
export function snapshot(id: string, label?: string): Promise<boolean> {
  return git.commitAll(docPath(id), label?.trim() || 'Snapshot')
}

/** History of the document, newest first. */
export function log(id: string): Promise<CommitInfo[]> {
  return git.log(docPath(id))
}

/** The manuscript's contents at a given revision. */
export function show(id: string, rev: string): Promise<string> {
  return git.showFile(docPath(id), rev, DOC_FILE)
}

/**
 * Restore the manuscript to a past revision: snapshot any uncommitted work
 * first (so it stays reachable), write the old content, then commit the restore.
 * Returns the restored content. `writeDoc` records the write so the folder
 * watcher won't treat it as an external edit.
 */
export async function restore(id: string, rev: string): Promise<string> {
  const dir = docPath(id)
  const old = await git.showFile(dir, rev, DOC_FILE)
  await git.commitAll(dir, 'Before restore')
  await writeDoc(id, old)
  await git.commitAll(dir, `Restored version ${rev.slice(0, 7)}`)
  return old
}
