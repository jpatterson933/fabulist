import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { CommitInfo } from '@shared/types'

const exec = promisify(execFile)

// Identity is passed per-invocation so commits work even with no global git config.
const ID = ['-c', 'user.name=Fabulist', '-c', 'user.email=fabulist@local']

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', [...ID, ...args], { cwd, maxBuffer: 32 * 1024 * 1024 })
  return stdout
}

export async function initRepo(cwd: string): Promise<void> {
  await git(cwd, ['init', '-q', '-b', 'main'])
}

/** Stage everything and commit. No-op (returns false) when the tree is clean. */
export async function commitAll(cwd: string, message: string): Promise<boolean> {
  await git(cwd, ['add', '-A'])
  const status = await git(cwd, ['status', '--porcelain'])
  if (!status.trim()) return false
  await git(cwd, ['commit', '-q', '-m', message])
  return true
}

export async function log(cwd: string, limit = 200): Promise<CommitInfo[]> {
  try {
    const out = await git(cwd, ['log', `-n${limit}`, '--pretty=format:%H%x09%at%x09%s'])
    if (!out.trim()) return []
    return out
      .trim()
      .split('\n')
      .map((line) => {
        const [hash, at, ...rest] = line.split('\t')
        return { hash, at: Number(at), subject: rest.join('\t') }
      })
  } catch {
    return [] // no commits yet
  }
}

export async function showFile(cwd: string, rev: string, file: string): Promise<string> {
  return git(cwd, ['show', `${rev}:${file}`])
}

// --- working-copy version control: the staging / discard / commit verbs the
// Plugin Studio drives. Each is a thin, path-scoped call over git() so a per-skill
// repo maps cleanly onto "working tree = Changes, index = Staged, HEAD = committed".

/** One changed path, split into its staged (X) and working-tree (Y) porcelain codes. */
export interface GitStatusEntry {
  rel: string
  /** index/staged code; ' ' = unmodified */
  x: string
  /** working-tree code; ' ' = unmodified, '?' = untracked */
  y: string
}

/**
 * Every changed path under the repo, parsed from `git status --porcelain -z`.
 * `-uall` lists every untracked file individually; without it git collapses a
 * wholly-untracked directory into one entry, so a brand-new folder of files would
 * show as a single dir row instead of its contents.
 */
export async function status(cwd: string): Promise<GitStatusEntry[]> {
  const out = await git(cwd, ['status', '--porcelain', '-uall', '-z'])
  const parts = out.split('\0')
  const entries: GitStatusEntry[] = []
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]
    if (!entry) continue
    const x = entry[0]
    const y = entry[1]
    // A rename/copy carries the source path in the next NUL field; the new path is here.
    if (x === 'R' || x === 'C') i++
    entries.push({ rel: entry.slice(3), x, y })
  }
  return entries
}

/** True once the repo has at least one commit (every diff/show baseline needs HEAD). */
export async function hasHead(cwd: string): Promise<boolean> {
  try {
    await git(cwd, ['rev-parse', '--verify', '-q', 'HEAD'])
    return true
  } catch {
    return false
  }
}

export async function stageAll(cwd: string): Promise<void> {
  await git(cwd, ['add', '-A'])
}

export async function stagePath(cwd: string, rel: string): Promise<void> {
  await git(cwd, ['add', '--', rel])
}

/** Unstage everything — moves the index back to HEAD; the working tree is untouched. */
export async function unstageAll(cwd: string): Promise<void> {
  await git(cwd, ['reset', '-q'])
}

export async function unstagePath(cwd: string, rel: string): Promise<void> {
  await git(cwd, ['reset', '-q', '--', rel])
}

/** Discard one file's unstaged change: delete it if untracked, else restore it from the index. */
export async function discardPath(cwd: string, rel: string): Promise<void> {
  const out = await git(cwd, ['status', '--porcelain', '-z', '--', rel])
  const untracked = out.startsWith('??')
  if (untracked) await git(cwd, ['clean', '-fd', '--', rel])
  else await git(cwd, ['checkout', '--', rel])
}

/** Discard all unstaged changes: revert tracked files to the index, remove untracked. Staged content stays. */
export async function discardAll(cwd: string): Promise<void> {
  await git(cwd, ['checkout', '--', '.'])
  await git(cwd, ['clean', '-fd'])
}

/** Commit the staged index only (no `add`, no message). Returns false when nothing is staged. */
export async function commitIndex(cwd: string): Promise<boolean> {
  const staged = await git(cwd, ['diff', '--cached', '--name-only'])
  if (!staged.trim()) return false
  await git(cwd, ['commit', '-q', '--allow-empty-message', '-m', ''])
  return true
}
