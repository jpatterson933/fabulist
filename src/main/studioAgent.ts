import {
  query,
  type Options,
  type PermissionResult,
  type SDKUserMessage
} from '@anthropic-ai/claude-agent-sdk'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { app, type WebContents } from 'electron'
import type { AgentEvent, PermissionRequest } from '@shared/types'
import { newId } from './library'
import { decideTool, isFileEditTool } from './toolPolicy'
import { describeTool, buildToolPayload } from './toolRegistry'
import { commitAll } from './git'
import { parseSdkMessages, type ParsedRun, type SdkMessage } from './sdkStream'
import { emitEvent } from './ipcTyped'
import { ensureStudio, pluginPath } from './skillStudio'

/**
 * Mirrors agent.ts's engine resolution: in packaged builds the SDK's native binary
 * sits inside app.asar, which child_process.spawn can't execute. Returns undefined
 * in dev (the SDK resolves its own). Duplicated here, not imported, so the document
 * AgentManager stays untouched by the studio.
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
  } catch {
    return undefined
  }
}
const ENGINE_BINARY = resolveEngineBinary()

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
You are running inside Fabulist's Skill Studio as a TEST of the skill(s) under
development, which are loaded as a local plugin. Behave exactly as you would for a
real user who invoked the skill: follow the skill's instructions, ground yourself in
its materials, and produce the real deliverable. The working directory is a throwaway
sandbox — you may create or edit files there freely. Keep chat replies focused on the result.`

const AUTHOR_APPEND = `
You are helping the user AUTHOR a Claude skill inside Fabulist's Skill Studio. The working
directory IS the skill's plugin folder; the deliverable is its files — primarily the
skills/<name>/SKILL.md and any supporting materials. Read the files to understand the current
state, then make focused edits with Write/Edit. Briefly say what you changed. You can only edit
files inside this folder; other tools (e.g. running commands) are unavailable here.`

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

  async test(slug: string, prompt: string): Promise<void> {
    if (this.active.has(slug)) throw new Error('A test is already running for this skill')
    await ensureStudio()
    const cwd = await this.ensureSandbox(slug)

    this.emit({ kind: 'user-echo', docId: slug, itemId: newId(), text: prompt })
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
      pathToClaudeCodeExecutable: ENGINE_BINARY,
      resume: this.sessions.get(slug),
      abortController: abort,
      includePartialMessages: true,
      // isolate the test: load ONLY this skill's plugin, ignore ambient project/user config
      settingSources: [],
      plugins: [{ type: 'local', path: pluginPath(slug) }],
      systemPrompt: { type: 'preset', preset: 'claude_code', append: TEST_APPEND },
      permissionMode: 'default',
      canUseTool: (tool, toolInput) => this.gate(cwd, tool, toolInput as Record<string, unknown>),
      stderr: (line) => {
        if (process.env.FABULIST_DEBUG) console.error('[studio]', line)
      }
    }

    const q = query({ prompt: input(), options })
    this.active.set(slug, { abort, q })

    let run: ParsedRun = { ok: false, finalText: '' }
    try {
      const events = parseSdkMessages(q as AsyncIterable<SdkMessage>, { docId: slug, cwd, newId })
      let step = await events.next()
      while (!step.done) {
        this.emit(step.value)
        step = await events.next()
      }
      run = step.value
    } catch (err) {
      run = { ok: false, finalText: '', error: err instanceof Error ? err.message : String(err) }
    } finally {
      this.active.delete(slug)
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
   * path escapes (and app-managed files), which decideTool still denies — so a test
   * run can never reach outside its throwaway sandbox.
   */
  private async gate(
    cwd: string,
    tool: string,
    input: Record<string, unknown>
  ): Promise<PermissionResult> {
    const decision = decideTool(cwd, tool, input)
    if (decision.kind === 'deny') return { behavior: 'deny', message: decision.message }
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

  async authSend(slug: string, prompt: string): Promise<void> {
    if (this.authActive.has(slug)) throw new Error('Claude is already working on this skill')
    await ensureStudio()
    const cwd = pluginPath(slug)

    this.emitAuth({ kind: 'user-echo', docId: slug, itemId: newId(), text: prompt })
    this.emitAuth({ kind: 'status', docId: slug, status: 'starting' })

    const abort = new AbortController()
    const edits = { count: 0 }
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
      pathToClaudeCodeExecutable: ENGINE_BINARY,
      resume: this.authSessions.get(slug),
      abortController: abort,
      includePartialMessages: true,
      settingSources: ['project'],
      systemPrompt: { type: 'preset', preset: 'claude_code', append: AUTHOR_APPEND },
      permissionMode: 'default',
      canUseTool: (tool, ti) => this.authGate(slug, cwd, tool, ti as Record<string, unknown>, edits),
      stderr: (line) => {
        if (process.env.FABULIST_DEBUG) console.error('[studio:author]', line)
      }
    }

    const q = query({ prompt: input(), options })
    this.authActive.set(slug, { abort, q })

    let run: ParsedRun = { ok: false, finalText: '' }
    try {
      const events = parseSdkMessages(q as AsyncIterable<SdkMessage>, { docId: slug, cwd, newId })
      let step = await events.next()
      while (!step.done) {
        this.emitAuth(step.value)
        step = await events.next()
      }
      run = step.value
    } catch (err) {
      run = { ok: false, finalText: '', error: err instanceof Error ? err.message : String(err) }
    } finally {
      this.authActive.delete(slug)
    }

    if (run.sessionId) this.authSessions.set(slug, run.sessionId)
    if (edits.count > 0) {
      await commitAll(cwd, `Author: ${prompt.replace(/\s+/g, ' ').slice(0, 60)}`).catch(() => {})
    }
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
   * Authoring gate: read-only tools pass; file edits AUTO-APPLY (the studio is a build
   * workspace — fast iteration over approval cards) and are recorded as a collapsed diff
   * in chat; the path guard still confines edits to the skill's own folder; everything
   * else (e.g. Bash) is denied, so no command runs without a UI to approve it.
   */
  private async authGate(
    slug: string,
    cwd: string,
    tool: string,
    input: Record<string, unknown>,
    edits: { count: number }
  ): Promise<PermissionResult> {
    const decision = decideTool(cwd, tool, input)
    if (decision.kind === 'deny') return { behavior: 'deny', message: decision.message }
    if (decision.kind === 'allow') return { behavior: 'allow', updatedInput: input }
    if (isFileEditTool(tool) && decision.filePath) {
      const request = await this.buildAuthRequest(slug, cwd, tool, input, decision.filePath)
      this.emitAuth({ kind: 'edit-applied', docId: slug, request })
      edits.count++
      return { behavior: 'allow', updatedInput: input }
    }
    return { behavior: 'deny', message: 'Only file edits are available while authoring a skill here.' }
  }

  private async buildAuthRequest(
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
}

export const studioAgent = new StudioAgentManager()
