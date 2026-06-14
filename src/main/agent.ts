import { query, type Options, type PermissionResult, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { app, type WebContents } from 'electron'
import type { AgentEvent, ModelChoice, PermissionRequest, SendOptions } from '@shared/types'
import { toModelArg } from '@shared/model'
import {
  LIBRARY_ROOT,
  ensureLibraryRoot,
  docPath,
  DOC_FILE,
  readState,
  patchState,
  newId
} from './library'
import { commitAll } from './git'
import * as comments from './comments'
import { decideTool, isFileEditTool } from './toolPolicy'
import { describeTool, buildToolPayload } from './toolRegistry'
import { parseSdkMessages, type ParsedRun, type SdkMessage } from './sdkStream'
import { PermissionBroker } from './permissionBroker'
import { emitEvent } from './ipcTyped'

// Re-exported so existing importers (and tests) keep `agent.describeTool` working.
export { describeTool }

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

interface ActiveRun {
  abort: AbortController
  q: ReturnType<typeof query>
}

type Emitter = (event: AgentEvent) => void

export class AgentManager {
  private active = new Map<string, ActiveRun>()
  private permissions = new PermissionBroker()
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
    if (this.wc) emitEvent(this.wc, 'agent:event', event)
  }

  isBusy(docId: string): boolean {
    return this.active.has(docId)
  }

  resolvePermission(requestId: string, approved: boolean, answers?: Record<string, string>): void {
    this.permissions.resolve(requestId, approved, answers)
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
      model: toModelArg(state.model),
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

    // Translation of engine messages → AgentEvents is a pure generator (sdkStream);
    // send() just emits what it yields and acts on the run summary it returns.
    let run: ParsedRun = { ok: false, finalText: '' }
    try {
      const events = parseSdkMessages(q as AsyncIterable<SdkMessage>, { docId, cwd, newId })
      let step = await events.next()
      while (!step.done) {
        emit(step.value)
        step = await events.next()
      }
      run = step.value
    } catch (err) {
      run = { ok: false, finalText: '', error: err instanceof Error ? err.message : String(err) }
    } finally {
      this.active.delete(docId)
      this.permissions.clearDoc(docId)
    }

    await this.completeRun(docId, cwd, prompt, opts, run, editsApplied)
  }

  /** Post-run side-effects: persist the session, commit edits, reply to a comment, announce the result. */
  private async completeRun(
    docId: string,
    cwd: string,
    prompt: string,
    opts: SendOptions,
    run: ParsedRun,
    editsApplied: number
  ): Promise<void> {
    if (run.sessionId) await patchState(docId, { sessionId: run.sessionId }).catch(() => {})

    if (editsApplied > 0) {
      const label = prompt.replace(/\s+/g, ' ').slice(0, 64)
      await commitAll(cwd, `Claude: ${label}`).catch(() => {})
    }

    if (opts.commentId && run.ok && run.finalText.trim()) {
      await comments.reply(docId, opts.commentId, 'claude', run.finalText.trim()).catch(() => {})
    }

    this.emit({
      kind: 'result',
      docId,
      ok: run.ok,
      text: run.finalText,
      error: run.error,
      costUsd: run.costUsd,
      durationMs: run.durationMs,
      commentId: opts.commentId
    })
    this.emit({ kind: 'status', docId, status: run.ok ? 'done' : 'error', detail: run.error })
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
    const decision = decideTool(cwd, tool, input)
    if (decision.kind === 'deny') {
      return { behavior: 'deny', message: decision.message }
    }
    if (decision.kind === 'allow') {
      return { behavior: 'allow', updatedInput: input }
    }

    const filePath = decision.filePath
    if (isFileEditTool(tool)) {
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
    // The tool registry owns each tool's card payload (diff / command / questions).
    await buildToolPayload(request, tool, input, {
      cwd,
      readFile: (rel) => fs.readFile(path.resolve(cwd, rel), 'utf8')
    })
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
    return new Promise((resolve) => {
      const done = (approved: boolean, answers?: Record<string, string>): void => {
        this.permissions.delete(request.requestId)
        this.emit({ kind: 'permission-resolved', docId, requestId: request.requestId, approved })
        if (!this.permissions.hasAnyForDoc(docId)) {
          this.emit({ kind: 'status', docId, status: 'working' })
        }
        resolve({ approved, answers })
      }
      this.permissions.add(request, done)
      signal.addEventListener('abort', () => done(false), { once: true })
    })
  }

  /**
   * Re-emit any unresolved permission requests for a document. Called when the
   * renderer (re)attaches — a reload mid-approval must not strand the agent
   * waiting on a request the UI no longer knows about.
   */
  resendPending(docId: string): void {
    for (const request of this.permissions.requestsForDoc(docId)) {
      this.emit({ kind: 'permission-request', docId, request })
    }
  }
}

export function buildPrompt(prompt: string, opts: SendOptions): string {
  const parts: string[] = []
  if (opts.quote) {
    parts.push(`The author highlighted this passage in ${DOC_FILE}:\n\n"""\n${opts.quote}\n"""`)
  }
  if (opts.commentId) {
    parts.push(
      `This is a comment on that passage. Address it specifically. If a text change is warranted, edit ${DOC_FILE} directly. Your chat reply will be recorded in the comment thread, so keep it self-contained and brief.`
    )
  }
  parts.push(prompt)
  return parts.join('\n\n')
}

export const agentManager = new AgentManager()
