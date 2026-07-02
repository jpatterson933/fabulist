import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { CommentThread, CommentMessage } from '@shared/types'
import { projectPath, COMMENTS_FILE, newId } from './library'

/** comments.json is one file per project, keyed by project-relative filename. */
type CommentsFile = Record<string, { threads: CommentThread[] }>

function commentsPath(projectId: string): string {
  return path.join(projectPath(projectId), COMMENTS_FILE)
}

async function readCommentsFile(projectId: string): Promise<CommentsFile> {
  try {
    const data = JSON.parse(await fs.readFile(commentsPath(projectId), 'utf8'))
    return data && typeof data === 'object' ? (data as CommentsFile) : {}
  } catch {
    return {}
  }
}

export async function listThreads(projectId: string, file: string): Promise<CommentThread[]> {
  const data = await readCommentsFile(projectId)
  const bucket = data[file]
  return bucket && Array.isArray(bucket.threads) ? bucket.threads : []
}

async function saveThreads(
  projectId: string,
  file: string,
  threads: CommentThread[]
): Promise<void> {
  const data = await readCommentsFile(projectId)
  data[file] = { threads }
  await fs.writeFile(commentsPath(projectId), JSON.stringify(data, null, 2))
}

export async function addThread(
  projectId: string,
  file: string,
  anchor: CommentThread['anchor'],
  text: string
): Promise<CommentThread> {
  const threads = await listThreads(projectId, file)
  const thread: CommentThread = {
    id: newId(),
    anchor,
    status: 'open',
    createdAt: Date.now(),
    messages: [{ id: newId(), author: 'you', text, at: Date.now() }]
  }
  threads.push(thread)
  await saveThreads(projectId, file, threads)
  return thread
}

export async function reply(
  projectId: string,
  file: string,
  threadId: string,
  author: CommentMessage['author'],
  text: string
): Promise<CommentThread | null> {
  const threads = await listThreads(projectId, file)
  const thread = threads.find((t) => t.id === threadId)
  if (!thread) return null
  thread.messages.push({ id: newId(), author, text, at: Date.now() })
  await saveThreads(projectId, file, threads)
  return thread
}

export async function setStatus(
  projectId: string,
  file: string,
  threadId: string,
  status: CommentThread['status']
): Promise<void> {
  const threads = await listThreads(projectId, file)
  const thread = threads.find((t) => t.id === threadId)
  if (!thread) return
  thread.status = status
  await saveThreads(projectId, file, threads)
}

export async function removeThread(
  projectId: string,
  file: string,
  threadId: string
): Promise<void> {
  const threads = await listThreads(projectId, file)
  await saveThreads(
    projectId,
    file,
    threads.filter((t) => t.id !== threadId)
  )
}

/** Renderer keeps anchors mapped through edits; persist the whole set at once. */
export async function updateAnchors(
  projectId: string,
  file: string,
  anchors: { id: string; anchor: CommentThread['anchor']; status?: CommentThread['status'] }[]
): Promise<void> {
  const threads = await listThreads(projectId, file)
  for (const a of anchors) {
    const t = threads.find((th) => th.id === a.id)
    if (!t) continue
    t.anchor = a.anchor
    if (a.status) t.status = a.status
  }
  await saveThreads(projectId, file, threads)
}
