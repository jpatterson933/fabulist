import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { CommentThread, CommentMessage } from '@shared/types'
import { projectPath, COMMENTS_FILE, newId } from './library'

/** comments.json is one file per project, keyed by doc filename. */
type CommentsFile = Record<string, { threads: CommentThread[] }>

function file(projectId: string): string {
  return path.join(projectPath(projectId), COMMENTS_FILE)
}

async function readFile(projectId: string): Promise<CommentsFile> {
  try {
    const data = JSON.parse(await fs.readFile(file(projectId), 'utf8'))
    return data && typeof data === 'object' ? (data as CommentsFile) : {}
  } catch {
    return {}
  }
}

export async function listThreads(projectId: string, docFile: string): Promise<CommentThread[]> {
  const data = await readFile(projectId)
  const bucket = data[docFile]
  return bucket && Array.isArray(bucket.threads) ? bucket.threads : []
}

async function saveThreads(
  projectId: string,
  docFile: string,
  threads: CommentThread[]
): Promise<void> {
  const data = await readFile(projectId)
  data[docFile] = { threads }
  await fs.writeFile(file(projectId), JSON.stringify(data, null, 2))
}

export async function addThread(
  projectId: string,
  docFile: string,
  anchor: CommentThread['anchor'],
  text: string
): Promise<CommentThread> {
  const threads = await listThreads(projectId, docFile)
  const thread: CommentThread = {
    id: newId(),
    anchor,
    status: 'open',
    createdAt: Date.now(),
    messages: [{ id: newId(), author: 'you', text, at: Date.now() }]
  }
  threads.push(thread)
  await saveThreads(projectId, docFile, threads)
  return thread
}

export async function reply(
  projectId: string,
  docFile: string,
  threadId: string,
  author: CommentMessage['author'],
  text: string
): Promise<CommentThread | null> {
  const threads = await listThreads(projectId, docFile)
  const thread = threads.find((t) => t.id === threadId)
  if (!thread) return null
  thread.messages.push({ id: newId(), author, text, at: Date.now() })
  await saveThreads(projectId, docFile, threads)
  return thread
}

export async function setStatus(
  projectId: string,
  docFile: string,
  threadId: string,
  status: CommentThread['status']
): Promise<void> {
  const threads = await listThreads(projectId, docFile)
  const thread = threads.find((t) => t.id === threadId)
  if (!thread) return
  thread.status = status
  await saveThreads(projectId, docFile, threads)
}

export async function removeThread(
  projectId: string,
  docFile: string,
  threadId: string
): Promise<void> {
  const threads = await listThreads(projectId, docFile)
  await saveThreads(
    projectId,
    docFile,
    threads.filter((t) => t.id !== threadId)
  )
}

/** Renderer keeps anchors mapped through edits; persist the whole set at once. */
export async function updateAnchors(
  projectId: string,
  docFile: string,
  anchors: { id: string; anchor: CommentThread['anchor']; status?: CommentThread['status'] }[]
): Promise<void> {
  const threads = await listThreads(projectId, docFile)
  for (const a of anchors) {
    const t = threads.find((th) => th.id === a.id)
    if (!t) continue
    t.anchor = a.anchor
    if (a.status) t.status = a.status
  }
  await saveThreads(projectId, docFile, threads)
}
