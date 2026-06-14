import { promises as fs } from 'node:fs'
import type { AnchorUpdate, CommentThread, CommentMessage } from '@shared/types'
import { commentsFile as file, newId } from './library'

interface CommentsFile {
  threads: CommentThread[]
}

export async function listThreads(docId: string): Promise<CommentThread[]> {
  try {
    const data: CommentsFile = JSON.parse(await fs.readFile(file(docId), 'utf8'))
    return Array.isArray(data.threads) ? data.threads : []
  } catch {
    return []
  }
}

async function save(docId: string, threads: CommentThread[]): Promise<void> {
  await fs.writeFile(file(docId), JSON.stringify({ threads }, null, 2))
}

export async function addThread(
  docId: string,
  anchor: CommentThread['anchor'],
  text: string
): Promise<CommentThread> {
  const threads = await listThreads(docId)
  const thread: CommentThread = {
    id: newId(),
    anchor,
    status: 'open',
    createdAt: Date.now(),
    messages: [{ id: newId(), author: 'you', text, at: Date.now() }]
  }
  threads.push(thread)
  await save(docId, threads)
  return thread
}

export async function reply(
  docId: string,
  threadId: string,
  author: CommentMessage['author'],
  text: string
): Promise<CommentThread | null> {
  const threads = await listThreads(docId)
  const thread = threads.find((t) => t.id === threadId)
  if (!thread) return null
  thread.messages.push({ id: newId(), author, text, at: Date.now() })
  await save(docId, threads)
  return thread
}

export async function setStatus(
  docId: string,
  threadId: string,
  status: CommentThread['status']
): Promise<void> {
  const threads = await listThreads(docId)
  const thread = threads.find((t) => t.id === threadId)
  if (!thread) return
  thread.status = status
  await save(docId, threads)
}

export async function removeThread(docId: string, threadId: string): Promise<void> {
  const threads = await listThreads(docId)
  await save(
    docId,
    threads.filter((t) => t.id !== threadId)
  )
}

/** Renderer keeps anchors mapped through edits; persist the whole set at once. */
export async function updateAnchors(docId: string, anchors: AnchorUpdate[]): Promise<void> {
  const threads = await listThreads(docId)
  for (const a of anchors) {
    const t = threads.find((th) => th.id === a.id)
    if (!t) continue
    t.anchor = a.anchor
    if (a.status) t.status = a.status
  }
  await save(docId, threads)
}
