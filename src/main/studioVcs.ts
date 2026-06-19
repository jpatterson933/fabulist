import {
  status as gitStatus,
  showFile,
  stageAll,
  stagePath,
  unstageAll,
  unstagePath,
  discardAll,
  discardPath,
  commitIndex
} from './git'
import { pluginPath, readFile } from './skillStudio'
import type { StudioChange, StudioChanges, StudioFileDiff } from '@shared/types'

/**
 * Plugin Studio version control, scoped to one skill's own git repo
 * (.skill-studio/<slug>/). The three git planes map onto the studio's mental model:
 * the working tree is "Changes", the index is "Staged changes", and the last commit
 * (HEAD) is the committed/safe copy. Every call is a thin pass-through to git() rooted
 * at the skill's repo, so the whole feature stays unbraided from the rest of the studio.
 */

/** Turn a porcelain status code into the label a Changes/Staged row shows. */
function statusOf(code: string): StudioChange['status'] {
  if (code === 'A' || code === '?') return 'created'
  if (code === 'D') return 'deleted'
  if (code === 'R' || code === 'C') return 'renamed'
  return 'modified'
}

function byRel(a: StudioChange, b: StudioChange): number {
  return a.rel.localeCompare(b.rel)
}

/** Split the skill's git status into the unstaged (Changes) and staged sections. */
export async function changes(slug: string): Promise<StudioChanges> {
  const entries = await gitStatus(pluginPath(slug))
  const unstaged: StudioChange[] = []
  const staged: StudioChange[] = []
  for (const e of entries) {
    if (e.y !== ' ') unstaged.push({ rel: e.rel, status: statusOf(e.y) })
    if (e.x !== ' ' && e.x !== '?') staged.push({ rel: e.rel, status: statusOf(e.x) })
  }
  return { changes: unstaged.sort(byRel), staged: staged.sort(byRel) }
}

export const stage = (slug: string, rel: string): Promise<void> => stagePath(pluginPath(slug), rel)
export const stageEverything = (slug: string): Promise<void> => stageAll(pluginPath(slug))
export const unstage = (slug: string, rel: string): Promise<void> => unstagePath(pluginPath(slug), rel)
export const unstageEverything = (slug: string): Promise<void> => unstageAll(pluginPath(slug))
export const discard = (slug: string, rel: string): Promise<void> => discardPath(pluginPath(slug), rel)
export const discardEverything = (slug: string): Promise<void> => discardAll(pluginPath(slug))

/** Commit the staged index. Returns false when nothing is staged. */
export const commit = (slug: string): Promise<boolean> => commitIndex(pluginPath(slug))

/** A NUL byte in the first 8KB means git treats the blob as binary — no meaningful text diff. */
function looksBinary(s: string): boolean {
  const head = s.slice(0, 8000)
  for (let i = 0; i < head.length; i++) {
    if (head.charCodeAt(i) === 0) return true
  }
  return false
}

function pack(before: string, after: string): StudioFileDiff {
  if (looksBinary(before) || looksBinary(after)) return { before: '', after: '', binary: true }
  return { before, after, binary: false }
}

/**
 * The before/after text for one file's diff. A "staged" row compares the index to HEAD;
 * a "changes" row compares the working tree to its baseline — the index if the file is
 * staged, else HEAD. A missing side (a created or deleted file) resolves to empty text.
 */
export async function diff(slug: string, rel: string, scope: 'changes' | 'staged'): Promise<StudioFileDiff> {
  const repo = pluginPath(slug)
  const head = (): Promise<string> => showFile(repo, 'HEAD', rel).catch(() => '')
  const index = (): Promise<string | null> => showFile(repo, '', rel).catch(() => null)

  if (scope === 'staged') {
    return pack(await head(), (await index()) ?? '')
  }
  const after = await readFile(slug, rel).catch(() => '')
  const before = (await index()) ?? (await head())
  return pack(before, after)
}
