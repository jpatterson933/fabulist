import { query, type Options, type PermissionResult, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { app, type WebContents } from 'electron'
import type { AgentEvent, ModelChoice, PermissionRequest, SendOptions } from '@shared/types'
import {
  LIBRARY_ROOT,
  ensureLibraryRoot,
  projectPath,
  COMMENTS_FILE,
  DEFAULT_THREAD_TITLE,
  readState,
  listThreads,
  getThreadSession,
  updateThread,
  newId
} from './library'
import { commitAll } from './git'
import * as comments from './comments'

/** System prompt tail; the currently-focused doc (if any) is appended per send. */
function systemAppend(docFile?: string): string {
  const focus = docFile
    ? `The author is currently focused on \`${docFile}\`; treat it as the primary document unless they say otherwise, but you may read and edit any document in the project.`
    : `The author has not opened a specific document yet.`
  return `
You are operating inside Fabulist, a writing studio. The current working directory is a
project folder that holds one or more documents as Markdown files. ${focus} Follow the
project CLAUDE.md. Every file edit you make is shown to the author as a diff for approval
before it is applied, so make edits confidently but keep them minimal and well-scoped.
Keep chat replies short — the documents are the deliverable, not the conversation.`
}

/**
 * In packaged builds the SDK resolves its native engine binary inside app.asar,
 * which child_process.spawn cannot execute (spawn gets no asar translation).
 * Resolve the binary ourselves and point at the asar-unpacked copy.
 * Returns undefined in dev, where the SDK's own resolution works.
 */
function resolveEngineBinary(): string | undefined {
  if (!app.isPackaged) return undefined
  try {
    const req = createRequire(import.meta.url)
    const pkg = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`
    const bin = path.join(
      path.dirname(req.resolve(`${pkg}/package.json`)),
      process.platform === 'win32' ? 'claude.exe' : 'claude'
    )
    return bin.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`)
  } catch (err) {
    console.error('[fabulist:engine] could not resolve native engine binary', err)
    return undefined
  }
}

const ENGINE_BINARY = resolveEngineBinary()

// Tools that read but never mutate — no approval needed.
const READ_ONLY = new Set([
  'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'TodoWrite', 'Task', 'NotebookRead', 'ListMcpResourcesTool'
])

interface ActiveRun {
  abort: AbortController
  q: ReturnType<typeof query>
}

type Emitter = (event: AgentEvent) => void

export class AgentManager {
  private active = new Map<string, ActiveRun>()
  private pendingPermissions = new Map<string, (approved: boolean) => void>()
  private pendingRequests = new Map<string, PermissionRequest>()
  private wc: WebContents | null = null
  private modelsCache: ModelChoice[] | null = null

  /**
   * Ask the Claude Code engine which models this CLI version + account can use.
   * Uses the SDK control channel only — no user message is sent, no tokens spent.
   * Cached for the app's lifetime (the CLI doesn't change mid-run).
   */
  async listModels(): Promise<ModelChoice[]> {
    if (this.modelsCache) return this.modelsCache
    const abort = new AbortController()
    try {
      await ensureLibraryRoot()
      const q = query({
        // keep the input stream open; we only need the control channel
        prompt: (async function* () {
          await new Promise<never>(() => {})
        })() as AsyncGenerator<SDKUserMessage>,
        options: {
          cwd: LIBRARY_ROOT,
          abortController: abort,
          maxTurns: 1,
          pathToClaudeCodeExecutable: ENGINE_BINARY,
          stderr: (line) => console.error('[fabulist:engine]', line)
        }
      })
      // drain in the background so abort doesn't surface as an unhandled rejection
      void (async () => {
        try {
          for await (const _ of q) void _
        } catch {
          /* aborted */
        }
      })()
      const models = await q.supportedModels()
      this.modelsCache = models.map((m) => ({
        value: m.value,
        label: m.displayName,
        hint: m.description
      }))
    } catch (err) {
      console.error('[fabulist:models]', err)
      return [] // renderer falls back to static aliases
    } finally {
      abort.abort()
    }
    return this.modelsCache ?? []
  }

  attach(wc: WebContents): void {
    this.wc = wc
  }

  private emit(event: AgentEvent): void {
    if (this.wc && !this.wc.isDestroyed()) this.wc.send('agent:event', event)
  }

  isBusy(projectId: string): boolean {
    return this.active.has(projectId)
  }

  resolvePermission(requestId: string, approved: boolean): void {
    const resolve = this.pendingPermissions.get(requestId)
    if (resolve) {
      this.pendingPermissions.delete(requestId)
      resolve(approved)
    }
  }

  async interrupt(projectId: string): Promise<void> {
    const run = this.active.get(projectId)
    if (!run) return
    try {
      await run.q.interrupt()
    } catch {
      run.abort.abort()
    }
  }

  async send(projectId: string, threadId: string, prompt: string, opts: SendOptions = {}): Promise<void> {
    if (this.active.has(projectId)) throw new Error('Claude is already working on this project')
    const cwd = projectPath(projectId)
    const emit: Emitter = (e) => this.emit(e)

    const userItemId = newId()
    emit({
      kind: 'user-echo',
      projectId,
      threadId,
      itemId: userItemId,
      text: prompt,
      quote: opts.quote,
      attachments: opts.attachments?.map((a) => a.name)
    })
    emit({ kind: 'status', projectId, status: 'starting' })

    const state = await readState(projectId)
    const priorSession = await getThreadSession(projectId, threadId)
    // name a still-untitled, still-empty thread after its opening message
    const meta = (await listThreads(projectId)).find((t) => t.id === threadId)
    if (meta && meta.messageCount === 0 && meta.title === DEFAULT_THREAD_TITLE) {
      await updateThread(projectId, threadId, { title: titleFromPrompt(prompt) }).catch(() => {})
    }
    const abort = new AbortController()
    let editsApplied = 0

    const content = await buildUserContent(cwd, prompt, opts)

    async function* input(): AsyncGenerator<SDKUserMessage> {
      yield {
        type: 'user',
        message: { role: 'user', content },
        parent_tool_use_id: null,
        session_id: ''
      }
    }

    const options: Options = {
      cwd,
      model: state.model || undefined,
      pathToClaudeCodeExecutable: ENGINE_BINARY,
      resume: priorSession,
      abortController: abort,
      includePartialMessages: true,
      settingSources: ['project'],
      systemPrompt: { type: 'preset', preset: 'claude_code', append: systemAppend(opts.docFile) },
      permissionMode: 'default',
      canUseTool: (tool, input, { signal }) =>
        this.gateTool(projectId, cwd, tool, input as Record<string, unknown>, signal, () => editsApplied++),
      stderr: (line) => {
        if (process.env.FABULIST_DEBUG) console.error('[claude]', line)
      }
    }

    const q = query({ prompt: input(), options })
    this.active.set(projectId, { abort, q })

    let sessionId: string | undefined
    let currentItemId = newId()
    let streamedText = ''
    let finalText = ''
    let resultOk = false
    let resultError: string | undefined
    let costUsd: number | undefined
    let durationMs: number | undefined

    try {
      for await (const msg of q) {
        if ('session_id' in msg && msg.session_id) sessionId = msg.session_id

        switch (msg.type) {
          case 'stream_event': {
            const ev = msg.event as { type: string; delta?: { type: string; text?: string } }
            if (ev.type === 'message_start') {
              // a fresh assistant message begins
              if (streamedText) currentItemId = newId()
              streamedText = ''
            }
            if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
              streamedText += ev.delta.text
              emit({ kind: 'text-delta', projectId, threadId, itemId: currentItemId, delta: ev.delta.text })
              emit({ kind: 'status', projectId, status: 'working' })
            }
            break
          }
          case 'assistant': {
            // content block unions vary across SDK patch releases; treat structurally
            const blocks = msg.message.content as Array<{
              type: string
              text?: string
              id?: string
              name?: string
              input?: unknown
            }>
            const text = blocks
              .filter((b) => b.type === 'text')
              .map((b) => b.text ?? '')
              .join('\n')
            if (text.trim()) {
              emit({ kind: 'assistant-text', projectId, threadId, itemId: currentItemId, text })
              finalText = text
              streamedText = ''
            }
            for (const b of blocks) {
              if (b.type === 'tool_use' && b.id && b.name) {
                emit({
                  kind: 'tool-note',
                  projectId,
                  threadId,
                  itemId: currentItemId,
                  toolId: b.id,
                  note: describeTool(b.name, b.input as Record<string, unknown>, cwd)
                })
                emit({ kind: 'status', projectId, status: 'working', detail: b.name })
              }
            }
            break
          }
          case 'user': {
            // tool results come back as user messages
            const content = msg.message.content
            if (Array.isArray(content)) {
              for (const b of content) {
                if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
                  emit({
                    kind: 'tool-note',
                    projectId,
                    threadId,
                    itemId: currentItemId,
                    toolId: b.tool_use_id,
                    note: '',
                    done: true,
                    ok: !b.is_error
                  })
                }
              }
            }
            break
          }
          case 'result': {
            resultOk = msg.subtype === 'success'
            if (msg.subtype === 'success') {
              if (msg.result?.trim()) finalText = msg.result
            } else {
              resultError = msg.subtype.replace(/_/g, ' ')
            }
            costUsd = msg.total_cost_usd
            durationMs = msg.duration_ms
            break
          }
        }
      }
    } catch (err) {
      resultOk = false
      resultError = err instanceof Error ? err.message : String(err)
    } finally {
      this.active.delete(projectId)
      // fail any approval cards still open
      for (const [id, resolve] of this.pendingPermissions) {
        resolve(false)
        emit({ kind: 'permission-resolved', projectId, requestId: id, approved: false })
      }
      this.pendingPermissions.clear()
    }

    if (sessionId) await updateThread(projectId, threadId, { sessionId }).catch(() => {})

    if (editsApplied > 0) {
      const label = prompt.replace(/\s+/g, ' ').slice(0, 64)
      await commitAll(cwd, `Claude: ${label}`).catch(() => {})
    }

    if (opts.commentId && opts.docFile && resultOk && finalText.trim()) {
      await comments.reply(projectId, opts.docFile, opts.commentId, 'claude', finalText.trim()).catch(() => {})
    }

    emit({
      kind: 'result',
      projectId,
      threadId,
      ok: resultOk,
      text: finalText,
      error: resultError,
      costUsd,
      durationMs,
      commentId: opts.commentId,
      docFile: opts.docFile
    })
    emit({ kind: 'status', projectId, status: resultOk ? 'done' : 'error', detail: resultError })
  }

  /** The approval gate. Decides per tool whether to allow, deny, or ask the human. */
  private async gateTool(
    projectId: string,
    cwd: string,
    tool: string,
    input: Record<string, unknown>,
    signal: AbortSignal,
    onEditApplied: () => void
  ): Promise<PermissionResult> {
    if (READ_ONLY.has(tool) || tool.startsWith('mcp__')) {
      return { behavior: 'allow', updatedInput: input }
    }

    const fileTools = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
    let filePath: string | undefined
    if (fileTools.has(tool) && typeof input.file_path === 'string') {
      filePath = path.relative(cwd, path.resolve(cwd, input.file_path))
    }

    // comments.json belongs to the app
    if (filePath === COMMENTS_FILE) {
      return {
        behavior: 'deny',
        message: 'comments.json is managed by Fabulist. Reply in chat instead; the app records comment replies.'
      }
    }

    const request = await this.buildRequest(projectId, cwd, tool, input, filePath)
    const approved = await this.askHuman(projectId, request, signal)
    if (approved) {
      if (filePath) onEditApplied()
      return { behavior: 'allow', updatedInput: input }
    }
    return { behavior: 'deny', message: 'The author declined this change.' }
  }

  private async buildRequest(
    projectId: string,
    cwd: string,
    tool: string,
    input: Record<string, unknown>,
    filePath?: string
  ): Promise<PermissionRequest> {
    const request: PermissionRequest = {
      requestId: newId(),
      projectId,
      tool,
      filePath,
      summary: describeTool(tool, input, cwd)
    }
    if (tool === 'Bash') {
      request.command = String(input.command ?? '')
    } else if (tool === 'Write' && filePath) {
      request.after = String(input.content ?? '')
      request.before = await fs
        .readFile(path.resolve(cwd, filePath), 'utf8')
        .catch(() => '')
    } else if (tool === 'Edit') {
      request.before = String(input.old_string ?? '')
      request.after = String(input.new_string ?? '')
      request.edits = [
        { old: request.before, new: request.after, all: Boolean(input.replace_all) }
      ]
    } else if (tool === 'MultiEdit' && Array.isArray(input.edits)) {
      const edits = input.edits as { old_string?: string; new_string?: string; replace_all?: boolean }[]
      request.before = edits.map((e) => e.old_string ?? '').join('\n…\n')
      request.after = edits.map((e) => e.new_string ?? '').join('\n…\n')
      request.edits = edits.map((e) => ({
        old: String(e.old_string ?? ''),
        new: String(e.new_string ?? ''),
        all: Boolean(e.replace_all)
      }))
    }
    return request
  }

  private askHuman(projectId: string, request: PermissionRequest, signal: AbortSignal): Promise<boolean> {
    this.emit({ kind: 'permission-request', projectId, request })
    this.pendingRequests.set(request.requestId, request)
    return new Promise<boolean>((resolve) => {
      const done = (approved: boolean): void => {
        this.pendingPermissions.delete(request.requestId)
        this.pendingRequests.delete(request.requestId)
        this.emit({ kind: 'permission-resolved', projectId, requestId: request.requestId, approved })
        resolve(approved)
      }
      this.pendingPermissions.set(request.requestId, done)
      signal.addEventListener('abort', () => done(false), { once: true })
    })
  }

  /**
   * Re-emit any unresolved permission requests for a project. Called when the
   * renderer (re)attaches — a reload mid-approval must not strand the agent
   * waiting on a request the UI no longer knows about.
   */
  resendPending(projectId: string): void {
    for (const request of this.pendingRequests.values()) {
      if (request.projectId === projectId) {
        this.emit({ kind: 'permission-request', projectId, request })
      }
    }
  }
}

/** A short thread title derived from its opening message. */
function titleFromPrompt(prompt: string): string {
  const clean = prompt.replace(/\s+/g, ' ').trim()
  if (!clean) return DEFAULT_THREAD_TITLE
  return clean.length > 48 ? clean.slice(0, 47).trimEnd() + '…' : clean
}

function buildPrompt(prompt: string, opts: SendOptions): string {
  const parts: string[] = []
  const where = opts.docFile ? ` in \`${opts.docFile}\`` : ''
  if (opts.quote) {
    parts.push(`The author highlighted this passage${where}:\n\n"""\n${opts.quote}\n"""`)
  }
  if (opts.commentId) {
    parts.push(
      `This is a comment on that passage. Address it specifically. If a text change is warranted, edit ${opts.docFile ?? 'the document'} directly. Your chat reply will be recorded in the comment thread, so keep it self-contained and brief.`
    )
  }
  parts.push(prompt)
  return parts.join('\n\n')
}

// Anthropic API ceilings; over these we fall back to copy-into-project + Read.
const IMAGE_MEDIA_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}
const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_INLINE_PDF_BYTES = 32 * 1024 * 1024

/** Copy an attached file into the doc's `attachments/` folder, suffixing on name collision. */
async function copyAttachmentIntoProject(cwd: string, src: string, name: string): Promise<string> {
  const dir = path.join(cwd, 'attachments')
  await fs.mkdir(dir, { recursive: true })
  const ext = path.extname(name)
  const base = path.basename(name, ext)
  let candidate = name
  for (let n = 1; ; n++) {
    try {
      await fs.access(path.join(dir, candidate))
      candidate = `${base}-${n}${ext}`
    } catch {
      break // free name
    }
  }
  await fs.copyFile(src, path.join(dir, candidate))
  return path.posix.join('attachments', candidate)
}

/**
 * Build the SDK user-message content. With no attachments this is the plain
 * prompt string (unchanged behavior). Images and PDFs ride along as base64
 * content blocks; everything else is copied into the project folder and
 * referenced so Claude can open it with its Read tool.
 */
async function buildUserContent(
  cwd: string,
  prompt: string,
  opts: SendOptions
): Promise<string | unknown[]> {
  const text = buildPrompt(prompt, opts)
  const attachments = opts.attachments ?? []
  if (attachments.length === 0) return text

  const blocks: unknown[] = []
  const copied: string[] = []
  const failed: string[] = []

  for (const att of attachments) {
    const ext = path.extname(att.name).toLowerCase()
    try {
      if (IMAGE_MEDIA_TYPES[ext]) {
        const buf = await fs.readFile(att.path)
        if (buf.byteLength <= MAX_INLINE_IMAGE_BYTES) {
          blocks.push({
            type: 'image',
            source: { type: 'base64', media_type: IMAGE_MEDIA_TYPES[ext], data: buf.toString('base64') }
          })
          continue
        }
      } else if (ext === '.pdf') {
        const buf = await fs.readFile(att.path)
        if (buf.byteLength <= MAX_INLINE_PDF_BYTES) {
          blocks.push({
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') },
            title: att.name
          })
          continue
        }
      }
      // unsupported type, or too large to inline: keep it in the workspace
      copied.push(await copyAttachmentIntoProject(cwd, att.path, att.name))
    } catch {
      failed.push(att.name)
    }
  }

  let leadText = text
  if (copied.length) {
    leadText +=
      `\n\nThe author attached these files (in the project folder):\n` +
      copied.map((p) => `- ${p}`).join('\n') +
      '\n\nUse your Read tool to open any you need.'
  }
  if (failed.length) {
    leadText += `\n\n(Could not read these attachments: ${failed.join(', ')}.)`
  }

  if (blocks.length === 0) return leadText
  const content: unknown[] = []
  if (leadText.trim()) content.push({ type: 'text', text: leadText })
  content.push(...blocks)
  return content
}

function describeTool(tool: string, input: Record<string, unknown>, cwd: string): string {
  const rel = (p: unknown): string =>
    typeof p === 'string' ? path.relative(cwd, path.resolve(cwd, p)) || '.' : ''
  switch (tool) {
    case 'Read':
      return `Reading ${rel(input.file_path)}`
    case 'Write':
      return `Writing ${rel(input.file_path)}`
    case 'Edit':
    case 'MultiEdit':
      return `Editing ${rel(input.file_path)}`
    case 'Bash':
      return `Running: ${String(input.command ?? '').slice(0, 80)}`
    case 'Grep':
      return `Searching for "${String(input.pattern ?? '')}"`
    case 'Glob':
      return `Listing ${String(input.pattern ?? '')}`
    case 'WebSearch':
      return `Searching the web: ${String(input.query ?? '')}`
    case 'WebFetch':
      return `Fetching ${String(input.url ?? '')}`
    case 'TodoWrite':
      return 'Updating plan'
    case 'Task':
      return `Delegating: ${String(input.description ?? '')}`
    default:
      return tool
  }
}

export const agentManager = new AgentManager()
