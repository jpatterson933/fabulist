import {
  query,
  type Options,
  type PermissionResult,
  type SDKUserMessage
} from '@anthropic-ai/claude-agent-sdk'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { type WebContents } from 'electron'
import type { AgentEvent, DisplayOptions, PermissionRequest } from '@shared/types'
import { newId } from './library'
import { decideTool, isFileEditTool } from './toolPolicy'
import { describeTool, buildToolPayload } from './toolRegistry'
import { parseSdkMessages, type ParsedRun, type SdkMessage } from './sdkStream'
import { PermissionBroker } from './permissionBroker'
import { ENGINE_BINARY } from './engineBinary'
import { emitEvent } from './ipcTyped'
import { toModelArg } from '@shared/model'
import { ensureStudio, pluginPath, readAuthSessionId, readSettings, saveAuthSessionId } from './skillStudio'
import { logToolDenied, toolActivityLogger } from './log'

/** Log token + cost consumption for a run — the client tracks this closely. */
function logUsage(label: string, slug: string, run: ParsedRun): void {
  const u = run.usage
  if (!u) return
  console.log(
    `[${label}] ${slug} — ${u.inputTokens} in / ${u.outputTokens} out / ` +
      `${u.cacheReadTokens} cache-read / ${u.cacheCreationTokens} cache-write` +
      (u.costUsd != null ? ` · $${u.costUsd.toFixed(4)}` : '') +
      (u.numTurns != null ? ` · ${u.numTurns} turns` : '')
  )
}

const TEST_APPEND = `
You are running inside Fabulist's Plugin Studio, testing the skill(s) under development —
loaded as a local plugin and enabled for this session. Behave as you would for any real
user: let the relevant skill and its own instructions drive what you read and do; don't
pre-read the whole skill folder. The working directory is a throwaway sandbox — you may
create or edit files there freely. Keep chat replies focused on the result.`

const AUTHOR_APPEND = (autoApprove: boolean): string => `
You are helping the user AUTHOR a Claude skill inside Fabulist's Plugin Studio. The working
directory IS the skill's plugin folder; the deliverable is its files — primarily the
skills/<name>/SKILL.md and any supporting materials. Read the files to understand the current
state, then make focused edits with Write/Edit. ${
  autoApprove
    ? 'Your file edits are applied immediately without review,'
    : 'Every file edit you make is shown to the user as a diff for approval before it is applied,'
} so make edits confidently but keep them minimal and well-scoped. Briefly say what you changed.
File reads and edits stay inside this folder, but the full toolset is available — Bash, web
fetch/search, and any connected MCP servers — so use them when they help (e.g. pulling source
material from a connected doc).`

interface ActiveRun {
  abort: AbortController
  q: ReturnType<typeof query>
}

/**
 * Runs a skill against a test prompt in a disposable sandbox, with the studio plugin
 * loaded straight off disk (skills + sub-agents + .mcp.json all come along). Wholly
 * independent of the document AgentManager: its own sessions (keyed by skill slug),
 * its own "auto-approve inside the jail" gate, streamed over skillStudio:event.
 */
export class StudioAgentManager {
  private active = new Map<string, ActiveRun>()
  /** resume id per skill, so follow-ups in a test thread continue the same session */
  private sessions = new Map<string, string>()
  /** throwaway working dir per skill's current test thread */
  private sandboxes = new Map<string, string>()
  /** authoring chat runs + their resume ids, keyed by skill slug */
  private authActive = new Map<string, ActiveRun>()
  private authSessions = new Map<string, string>()
  /** pending approval/question requests, shared by the test and authoring gates */
  private permissions = new PermissionBroker()
  private wc: WebContents | null = null

  attach(wc: WebContents): void {
    this.wc = wc
  }

  private emit(event: AgentEvent): void {
    if (this.wc) emitEvent(this.wc, 'skillStudio:event', event)
  }

  private emitAuth(event: AgentEvent): void {
    if (this.wc) emitEvent(this.wc, 'skillStudio:authEvent', event)
  }

  /** Resolve a pending approval/answer from the renderer (test or authoring). */
  resolvePermission(requestId: string, approved: boolean, answers?: Record<string, string>): void {
    this.permissions.resolve(requestId, approved, answers)
  }

  isBusy(slug: string): boolean {
    return this.active.has(slug)
  }

  async interrupt(slug: string): Promise<void> {
    const run = this.active.get(slug)
    if (!run) return
    try {
      await run.q.interrupt()
    } catch {
      run.abort.abort()
    }
  }

  /** Drop the session + sandbox so the next run is a clean thread that re-loads the skill from disk. */
  async resetTest(slug: string): Promise<void> {
    await this.interrupt(slug)
    this.sessions.delete(slug)
    const dir = this.sandboxes.get(slug)
    this.sandboxes.delete(slug)
    if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }

  private async ensureSandbox(slug: string): Promise<string> {
    const cur = this.sandboxes.get(slug)
    if (cur) return cur
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fabulist-skill-test-'))
    this.sandboxes.set(slug, dir)
    return dir
  }

  async test(slug: string, prompt: string, display?: DisplayOptions): Promise<void> {
    if (this.active.has(slug)) throw new Error('A test is already running for this skill')
    await ensureStudio()
    const cwd = await this.ensureSandbox(slug)
    const { model } = await readSettings(slug)

    // `prompt` is what the model receives (may carry a "use the <skill>" directive);
    // the chat echoes `display.echo` + a short marker when provided
    this.emit({
      kind: 'user-echo',
      docId: slug,
      itemId: newId(),
      text: display?.echo ?? prompt,
      quote: display?.quote
    })
    this.emit({ kind: 'status', docId: slug, status: 'starting' })

    const abort = new AbortController()
    async function* input(): AsyncGenerator<SDKUserMessage> {
      yield {
        type: 'user',
        message: { role: 'user', content: prompt },
        parent_tool_use_id: null,
        session_id: ''
      }
    }

    const options: Options = {
      cwd,
      model: toModelArg(model),
      pathToClaudeCodeExecutable: ENGINE_BINARY,
      resume: this.sessions.get(slug),
      abortController: abort,
      includePartialMessages: true,
      // isolate the test: load ONLY this skill's plugin, ignore ambient project/user config
      settingSources: [],
      plugins: [{ type: 'local', path: pluginPath(slug) }],
      // enable every skill the plugin ships (the SDK's first-class "skills on" knob) so the
      // model sees and can invoke them via the Skill tool, exactly as in a real session
      skills: 'all',
      systemPrompt: { type: 'preset', preset: 'claude_code', append: TEST_APPEND },
      permissionMode: 'default',
      canUseTool: (tool, toolInput, { signal }) =>
        this.gate(slug, cwd, tool, toolInput as Record<string, unknown>, signal),
      stderr: (line) => {
        if (process.env.FABULIST_DEBUG) console.error('[studio]', line)
      }
    }

    const q = query({ prompt: input(), options })
    this.active.set(slug, { abort, q })

    let run: ParsedRun = { ok: false, finalText: '' }
    const logTool = toolActivityLogger(`skill-test ${slug}`)
    try {
      const events = parseSdkMessages(q as AsyncIterable<SdkMessage>, { docId: slug, cwd, newId })
      let step = await events.next()
      while (!step.done) {
        this.emit(step.value)
        logTool(step.value)
        step = await events.next()
      }
      run = step.value
    } catch (err) {
      run = { ok: false, finalText: '', error: err instanceof Error ? err.message : String(err) }
    } finally {
      this.active.delete(slug)
      this.permissions.clearDoc(slug)
    }

    if (run.sessionId) this.sessions.set(slug, run.sessionId)
    logUsage('skill-test', slug, run)
    this.emit({
      kind: 'result',
      docId: slug,
      ok: run.ok,
      text: run.finalText,
      error: run.error,
      costUsd: run.costUsd,
      durationMs: run.durationMs,
      usage: run.usage
    })
    this.emit({ kind: 'status', docId: slug, status: run.ok ? 'done' : 'error', detail: run.error })
  }

  /**
   * The jail gate: auto-approve everything so iteration is friction-free, EXCEPT
   * (a) path escapes / app-managed files, which decideTool denies — so a test run
   * can never reach outside its throwaway sandbox — and (b) AskUserQuestion, which
   * is the skill genuinely asking the user a question: surface it and WAIT for the
   * tester's answer. (Auto-allowing it answer-less makes the engine treat the
   * question as skipped, so the skill silently proceeds on defaults — not a real test.)
   */
  private async gate(
    slug: string,
    cwd: string,
    tool: string,
    input: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<PermissionResult> {
    // the skill's own plugin folder is a read-only root, so a skill under test can
    // read its bundled files (its SKILL.md references them) from outside the sandbox
    const decision = decideTool(cwd, tool, input, [pluginPath(slug)])
    if (decision.kind === 'deny') {
      logToolDenied(`skill-test ${slug}`, tool, decision.message)
      return { behavior: 'deny', message: decision.message }
    }
    if (tool === 'AskUserQuestion') {
      const request = await this.buildRequest(slug, cwd, tool, input)
      const { approved, answers } = await this.askHuman((e) => this.emit(e), slug, request, signal)
      if (approved) return { behavior: 'allow', updatedInput: answers ? { ...input, answers } : input }
      return { behavior: 'deny', message: 'The tester skipped the question. Proceed with your best judgment.' }
    }
    return { behavior: 'allow', updatedInput: input }
  }

  // ── Authoring chat: an agent that reads/edits the skill IN its own folder ──

  authBusy(slug: string): boolean {
    return this.authActive.has(slug)
  }

  async authInterrupt(slug: string): Promise<void> {
    const run = this.authActive.get(slug)
    if (!run) return
    try {
      await run.q.interrupt()
    } catch {
      run.abort.abort()
    }
  }

  /**
   * Forget the authoring conversation's SDK session so the NEXT message starts cold
   * instead of resuming. Without rotating this, clearing the visible transcript alone
   * would leave `resume` pointing at the old session — the agent would silently
   * "remember" everything the user meant to wipe. Aborts any in-flight run first; the
   * on-disk transcript + resume id are cleared separately (skillStudio.resetAuthChat),
   * and the skill's own files are untouched.
   */
  async resetAuth(slug: string): Promise<void> {
    await this.authInterrupt(slug)
    this.authSessions.delete(slug)
  }

  async authSend(slug: string, prompt: string, display?: DisplayOptions): Promise<void> {
    if (this.authActive.has(slug)) throw new Error('Claude is already working on this skill')
    await ensureStudio()
    const cwd = pluginPath(slug)
    // read once at send for the system-prompt wording; the gate re-reads per call so a
    // mid-run toggle still takes effect (mirrors agent.ts: state for the prompt + the gate)
    const { model, autoApprove } = await readSettings(slug)

    // `prompt` is what the model receives (may carry a woven-in test transcript);
    // the chat echoes `display.echo` + a short quote marker when provided
    this.emitAuth({
      kind: 'user-echo',
      docId: slug,
      itemId: newId(),
      text: display?.echo ?? prompt,
      quote: display?.quote
    })
    this.emitAuth({ kind: 'status', docId: slug, status: 'starting' })

    // after a restart the resume id is only on disk — reload it so the authoring
    // conversation continues instead of starting cold (mirrors the document app)
    if (!this.authSessions.has(slug)) {
      const sid = await readAuthSessionId(slug).catch(() => undefined)
      if (sid) this.authSessions.set(slug, sid)
    }

    const abort = new AbortController()
    async function* input(): AsyncGenerator<SDKUserMessage> {
      yield {
        type: 'user',
        message: { role: 'user', content: prompt },
        parent_tool_use_id: null,
        session_id: ''
      }
    }

    const options: Options = {
      cwd,
      model: toModelArg(model),
      pathToClaudeCodeExecutable: ENGINE_BINARY,
      resume: this.authSessions.get(slug),
      abortController: abort,
      includePartialMessages: true,
      settingSources: ['project'],
      systemPrompt: { type: 'preset', preset: 'claude_code', append: AUTHOR_APPEND(autoApprove) },
      permissionMode: 'default',
      canUseTool: (tool, ti, { signal }) =>
        this.authGate(slug, cwd, tool, ti as Record<string, unknown>, signal),
      stderr: (line) => {
        if (process.env.FABULIST_DEBUG) console.error('[studio:author]', line)
      }
    }

    const q = query({ prompt: input(), options })
    this.authActive.set(slug, { abort, q })

    let run: ParsedRun = { ok: false, finalText: '' }
    const logTool = toolActivityLogger(`skill-author ${slug}`)
    try {
      const events = parseSdkMessages(q as AsyncIterable<SdkMessage>, { docId: slug, cwd, newId })
      let step = await events.next()
      while (!step.done) {
        this.emitAuth(step.value)
        logTool(step.value)
        step = await events.next()
      }
      run = step.value
    } catch (err) {
      run = { ok: false, finalText: '', error: err instanceof Error ? err.message : String(err) }
    } finally {
      this.authActive.delete(slug)
      this.permissions.clearDoc(slug)
    }

    if (run.sessionId) {
      this.authSessions.set(slug, run.sessionId)
      await saveAuthSessionId(slug, run.sessionId).catch(() => {})
    }
    // Authoring edits land in the working tree only; they surface as "Changes" for the
    // user to stage/commit. Nothing here advances the committed copy (HEAD) — only the
    // studio's explicit Commit does.
    logUsage('skill-author', slug, run)
    this.emitAuth({
      kind: 'result',
      docId: slug,
      ok: run.ok,
      text: run.finalText,
      error: run.error,
      costUsd: run.costUsd,
      durationMs: run.durationMs,
      usage: run.usage
    })
    this.emitAuth({ kind: 'status', docId: slug, status: run.ok ? 'done' : 'error', detail: run.error })
  }

  /**
   * Authoring gate — mirrors the document app's gate (src/main/agent.ts). Read-only
   * tools pass; file edits are shown to the user as a diff for approval before they
   * apply, UNLESS auto-apply is on (then they apply immediately for fast iteration);
   * either way an applied edit is recorded as a collapsed diff in chat. A clarifying
   * AskUserQuestion is surfaced and waited on. The path guard still confines file reads/
   * edits to the skill's own folder; everything else (Bash, web, MCP servers) runs without
   * a prompt, matching the test chat, so the authoring agent has a real session's tool reach.
   */
  private async authGate(
    slug: string,
    cwd: string,
    tool: string,
    input: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<PermissionResult> {
    const decision = decideTool(cwd, tool, input)
    if (decision.kind === 'deny') {
      logToolDenied(`skill-author ${slug}`, tool, decision.message)
      return { behavior: 'deny', message: decision.message }
    }
    if (decision.kind === 'allow') return { behavior: 'allow', updatedInput: input }
    if (isFileEditTool(tool) && decision.filePath) {
      // re-read auto-apply per call (not captured at send) so toggling it mid-run takes
      // effect immediately — exactly like the document app's gateTool (src/main/agent.ts)
      const { autoApprove } = await readSettings(slug)
      const request = await this.buildRequest(slug, cwd, tool, input, decision.filePath)
      if (!autoApprove) {
        const { approved } = await this.askHuman((e) => this.emitAuth(e), slug, request, signal)
        if (!approved) return { behavior: 'deny', message: 'The author declined this change.' }
      }
      // approved edits leave the same collapsed diff card in chat that auto-applied
      // ones do — the record shouldn't depend on the mode
      this.emitAuth({ kind: 'edit-applied', docId: slug, request })
      return { behavior: 'allow', updatedInput: input }
    }
    if (tool === 'AskUserQuestion') {
      const request = await this.buildRequest(slug, cwd, tool, input)
      const { approved, answers } = await this.askHuman((e) => this.emitAuth(e), slug, request, signal)
      if (approved) return { behavior: 'allow', updatedInput: answers ? { ...input, answers } : input }
      return { behavior: 'deny', message: 'The author skipped the question. Proceed with your best judgment.' }
    }
    // Anything else (Bash, web, MCP servers, …) runs without a prompt — matching the test
    // chat, so the authoring agent has the same tool reach as a real session. The path
    // guard above still confines file reads/edits to the skill's own folder.
    return { behavior: 'allow', updatedInput: input }
  }

  private async buildRequest(
    slug: string,
    cwd: string,
    tool: string,
    input: Record<string, unknown>,
    filePath?: string
  ): Promise<PermissionRequest> {
    const request: PermissionRequest = {
      requestId: newId(),
      docId: slug,
      tool,
      filePath,
      summary: describeTool(tool, input, cwd)
    }
    await buildToolPayload(request, tool, input, {
      cwd,
      readFile: (rel) => fs.readFile(path.resolve(cwd, rel), 'utf8')
    })
    return request
  }

  /**
   * Surface a request to the renderer and block until it answers (or the run is
   * interrupted). Mirrors AgentManager.askHuman; the emitter routes the events to
   * the right stream (test → skillStudio:event, authoring → skillStudio:authEvent).
   */
  private askHuman(
    emit: (event: AgentEvent) => void,
    slug: string,
    request: PermissionRequest,
    signal: AbortSignal
  ): Promise<{ approved: boolean; answers?: Record<string, string> }> {
    emit({ kind: 'permission-request', docId: slug, request })
    // the run is paused on the user, not working — say so, or a pending approval
    // reads as a frozen spinner
    emit({
      kind: 'status',
      docId: slug,
      status: 'working',
      detail: request.questions ? 'Waiting for your answer' : 'Waiting for your approval'
    })
    return new Promise((resolve) => {
      // the renderer (resolvePermission) and an interrupt (abort) can both reach
      // done(); settle exactly once so the resolution + events aren't emitted twice
      let settled = false
      const done = (approved: boolean, answers?: Record<string, string>): void => {
        if (settled) return
        settled = true
        this.permissions.delete(request.requestId)
        emit({ kind: 'permission-resolved', docId: slug, requestId: request.requestId, approved })
        if (!this.permissions.hasAnyForDoc(slug)) {
          emit({ kind: 'status', docId: slug, status: 'working' })
        }
        resolve({ approved, answers })
      }
      this.permissions.add(request, done)
      signal.addEventListener('abort', () => done(false), { once: true })
    })
  }
}

export const studioAgent = new StudioAgentManager()
