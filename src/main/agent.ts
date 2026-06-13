import { query, type Options, type PermissionResult, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { app, type WebContents } from 'electron'
import type { AgentEvent, ModelChoice, PermissionRequest, SendOptions } from '@shared/types'
import {
  LIBRARY_ROOT,
  ensureLibraryRoot,
  docPath,
  DOC_FILE,
  COMMENTS_FILE,
  readState,
  patchState,
  newId
} from './library'
import { commitAll } from './git'
import * as comments from './comments'

const systemAppend = (autoApprove: boolean): string => `
You are operating inside Fabulist, a writing studio. The current working directory is a
single document project; the document itself is document.md. Follow the project CLAUDE.md.
${
  autoApprove
    ? 'Your file edits are applied immediately without author review (every run is committed to history),'
    : 'Every file edit you make is shown to the author as a diff for approval before it is applied,'
}
so make edits confidently but keep them minimal and well-scoped. Keep chat replies short —
the document is the deliverable, not the conversation.`

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
  private pendingPermissions = new Map<
    string,
    (approved: boolean, answers?: Record<string, string>) => void
  >()
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

  isBusy(docId: string): boolean {
    return this.active.has(docId)
  }

  resolvePermission(requestId: string, approved: boolean, answers?: Record<string, string>): void {
    const resolve = this.pendingPermissions.get(requestId)
    if (resolve) {
      this.pendingPermissions.delete(requestId)
      resolve(approved, answers)
    }
  }

  async interrupt(docId: string): Promise<void> {
    const run = this.active.get(docId)
    if (!run) return
    try {
      await run.q.interrupt()
    } catch {
      run.abort.abort()
    }
  }

  async send(docId: string, prompt: string, opts: SendOptions = {}): Promise<void> {
    if (this.active.has(docId)) throw new Error('Claude is already working on this document')
    const cwd = docPath(docId)
    const emit: Emitter = (e) => this.emit(e)

    const userItemId = newId()
    emit({ kind: 'user-echo', docId, itemId: userItemId, text: prompt, quote: opts.quote })
    emit({ kind: 'status', docId, status: 'starting' })

    const state = await readState(docId)
    const abort = new AbortController()
    let editsApplied = 0

    const fullPrompt = buildPrompt(prompt, opts)

    async function* input(): AsyncGenerator<SDKUserMessage> {
      yield {
        type: 'user',
        message: { role: 'user', content: fullPrompt },
        parent_tool_use_id: null,
        session_id: ''
      }
    }

    const options: Options = {
      cwd,
      model: state.model || undefined,
      pathToClaudeCodeExecutable: ENGINE_BINARY,
      resume: state.sessionId,
      abortController: abort,
      includePartialMessages: true,
      settingSources: ['project'],
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: systemAppend(Boolean(state.autoApprove))
      },
      permissionMode: 'default',
      canUseTool: (tool, input, { signal }) =>
        this.gateTool(docId, cwd, tool, input as Record<string, unknown>, signal, () => editsApplied++),
      stderr: (line) => {
        if (process.env.FABULIST_DEBUG) console.error('[claude]', line)
      }
    }

    const q = query({ prompt: input(), options })
    this.active.set(docId, { abort, q })

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
              emit({ kind: 'text-delta', docId, itemId: currentItemId, delta: ev.delta.text })
              emit({ kind: 'status', docId, status: 'working' })
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
              emit({ kind: 'assistant-text', docId, itemId: currentItemId, text })
              finalText = text
              streamedText = ''
            }
            for (const b of blocks) {
              if (b.type === 'tool_use' && b.id && b.name) {
                emit({
                  kind: 'tool-note',
                  docId,
                  itemId: currentItemId,
                  toolId: b.id,
                  note: describeTool(b.name, b.input as Record<string, unknown>, cwd)
                })
                emit({ kind: 'status', docId, status: 'working', detail: b.name })
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
                    docId,
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
      this.active.delete(docId)
      // fail any approval cards still open
      for (const [id, resolve] of this.pendingPermissions) {
        resolve(false)
        emit({ kind: 'permission-resolved', docId, requestId: id, approved: false })
      }
      this.pendingPermissions.clear()
    }

    if (sessionId) await patchState(docId, { sessionId }).catch(() => {})

    if (editsApplied > 0) {
      const label = prompt.replace(/\s+/g, ' ').slice(0, 64)
      await commitAll(cwd, `Claude: ${label}`).catch(() => {})
    }

    if (opts.commentId && resultOk && finalText.trim()) {
      await comments.reply(docId, opts.commentId, 'claude', finalText.trim()).catch(() => {})
    }

    emit({
      kind: 'result',
      docId,
      ok: resultOk,
      text: finalText,
      error: resultError,
      costUsd,
      durationMs,
      commentId: opts.commentId
    })
    emit({ kind: 'status', docId, status: resultOk ? 'done' : 'error', detail: resultError })
  }

  /** The approval gate. Decides per tool whether to allow, deny, or ask the human. */
  private async gateTool(
    docId: string,
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

    // auto-approve mode: file edits apply immediately, no approval card.
    // Read fresh each time so flipping the toggle mid-run takes effect.
    if (fileTools.has(tool)) {
      const { autoApprove } = await readState(docId).catch(() => ({ autoApprove: false }))
      if (autoApprove) {
        if (filePath) {
          onEditApplied()
          // leave a record in chat: same diff data an approval card would carry
          const request = await this.buildRequest(docId, cwd, tool, input, filePath)
          this.emit({ kind: 'edit-applied', docId, request })
        }
        return { behavior: 'allow', updatedInput: input }
      }
    }

    const request = await this.buildRequest(docId, cwd, tool, input, filePath)
    const { approved, answers } = await this.askHuman(docId, request, signal)
    if (approved) {
      if (filePath) {
        onEditApplied()
        // approved edits leave the same collapsed diff card in chat that
        // auto-applied ones do — the record shouldn't depend on the mode
        this.emit({ kind: 'edit-applied', docId, request })
      }
      // AskUserQuestion answers travel back to the engine inside the input
      const updatedInput = answers ? { ...input, answers } : input
      return { behavior: 'allow', updatedInput }
    }
    if (tool === 'AskUserQuestion') {
      return { behavior: 'deny', message: 'The author skipped the question. Proceed with your best judgment.' }
    }
    return { behavior: 'deny', message: 'The author declined this change.' }
  }

  private async buildRequest(
    docId: string,
    cwd: string,
    tool: string,
    input: Record<string, unknown>,
    filePath?: string
  ): Promise<PermissionRequest> {
    const request: PermissionRequest = {
      requestId: newId(),
      docId,
      tool,
      filePath,
      summary: describeTool(tool, input, cwd)
    }
    if (tool === 'Bash') {
      request.command = String(input.command ?? '')
    } else if (tool === 'AskUserQuestion' && Array.isArray(input.questions)) {
      const questions = input.questions as {
        question?: string
        header?: string
        multiSelect?: boolean
        options?: { label?: string; description?: string }[]
      }[]
      request.questions = questions.map((q) => ({
        question: String(q.question ?? ''),
        header: String(q.header ?? ''),
        multiSelect: Boolean(q.multiSelect),
        options: (q.options ?? []).map((o) => ({
          label: String(o.label ?? ''),
          description: o.description ? String(o.description) : undefined
        }))
      }))
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

  private askHuman(
    docId: string,
    request: PermissionRequest,
    signal: AbortSignal
  ): Promise<{ approved: boolean; answers?: Record<string, string> }> {
    this.emit({ kind: 'permission-request', docId, request })
    // the run is paused on the author, not working — say so, or a pending
    // command approval reads as a frozen "Running:" spinner
    this.emit({
      kind: 'status',
      docId,
      status: 'working',
      detail: request.questions ? 'Waiting for your answer' : 'Waiting for your approval'
    })
    this.pendingRequests.set(request.requestId, request)
    return new Promise((resolve) => {
      const done = (approved: boolean, answers?: Record<string, string>): void => {
        this.pendingPermissions.delete(request.requestId)
        this.pendingRequests.delete(request.requestId)
        this.emit({ kind: 'permission-resolved', docId, requestId: request.requestId, approved })
        // drop the "Waiting for…" label once nothing is pending — long thinking
        // stretches emit no status, so a stale label would sit there lying
        if (this.pendingPermissions.size === 0) {
          this.emit({ kind: 'status', docId, status: 'working' })
        }
        resolve({ approved, answers })
      }
      this.pendingPermissions.set(request.requestId, done)
      signal.addEventListener('abort', () => done(false), { once: true })
    })
  }

  /**
   * Re-emit any unresolved permission requests for a document. Called when the
   * renderer (re)attaches — a reload mid-approval must not strand the agent
   * waiting on a request the UI no longer knows about.
   */
  resendPending(docId: string): void {
    for (const request of this.pendingRequests.values()) {
      if (request.docId === docId) {
        this.emit({ kind: 'permission-request', docId, request })
      }
    }
  }
}

function buildPrompt(prompt: string, opts: SendOptions): string {
  const parts: string[] = []
  if (opts.quote) {
    parts.push(`The author highlighted this passage in ${DOC_FILE}:\n\n"""\n${opts.quote}\n"""`)
  }
  if (opts.commentId) {
    parts.push(
      'This is a comment on that passage. Address it specifically. If a text change is warranted, edit document.md directly. Your chat reply will be recorded in the comment thread, so keep it self-contained and brief.'
    )
  }
  parts.push(prompt)
  return parts.join('\n\n')
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
    case 'AskUserQuestion': {
      const qs = input.questions as { question?: string }[] | undefined
      return `Asking: ${String(qs?.[0]?.question ?? '').slice(0, 80)}`
    }
    default:
      return tool
  }
}

export const agentManager = new AgentManager()
