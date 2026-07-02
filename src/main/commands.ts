// Studio commands: shell processes declared in fabulist.json (`commands`) and
// started only by an explicit user click in the UI — the agent has no path to
// them. The command line always comes from the manifest on disk, never from
// the renderer, so a compromised renderer can at worst run what the studio
// already declares. Output streams to the renderer over `command:event`; a
// bounded backlog is kept so a reattaching window can rebuild the log.

import { spawn, type ChildProcess } from 'node:child_process'
import type { WebContents } from 'electron'
import type { CommandEvent, CommandRunState } from '@shared/types'
import { loadMergedConfig } from './harness'
import { projectPath } from './library'

// keep the last ~200KB of output per command — enough scrollback to debug,
// bounded enough to hold for many long-running dev servers
const MAX_LOG = 200_000
const SIGKILL_GRACE_MS = 3_000

interface Running {
  child: ChildProcess
  log: string
  startedAt: number
}

const key = (projectId: string, commandId: string): string => `${projectId}\n${commandId}`

export class CommandManager {
  private wc: WebContents | null = null
  private running = new Map<string, Running>()
  /** last exit codes, so the UI can show "exited (1)" after the fact */
  private exited = new Map<string, { code: number | null; log: string }>()

  attach(wc: WebContents): void {
    this.wc = wc
  }

  private emit(event: CommandEvent): void {
    if (this.wc && !this.wc.isDestroyed()) this.wc.send('command:event', event)
  }

  isRunning(projectId: string, commandId: string): boolean {
    return this.running.has(key(projectId, commandId))
  }

  async start(projectId: string, commandId: string): Promise<void> {
    const k = key(projectId, commandId)
    if (this.running.has(k)) throw new Error('This command is already running')
    const config = await loadMergedConfig(projectId)
    const cmd = config.commands.find((c) => c.id === commandId)
    if (!cmd) throw new Error(`No command "${commandId}" in this studio's manifest`)

    // detached → its own process group, so stop() can kill the whole tree
    const child = spawn(cmd.run, {
      cwd: projectPath(projectId),
      shell: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    })
    const entry: Running = { child, log: '', startedAt: Date.now() }
    this.running.set(k, entry)
    this.exited.delete(k)
    this.emit({ kind: 'command-started', projectId, commandId })

    const append = (chunk: Buffer): void => {
      const text = chunk.toString('utf8')
      entry.log = (entry.log + text).slice(-MAX_LOG)
      this.emit({ kind: 'command-output', projectId, commandId, chunk: text })
    }
    child.stdout?.on('data', append)
    child.stderr?.on('data', append)
    child.on('error', (err) => {
      append(Buffer.from(`\n[fabulist] failed to run: ${err.message}\n`))
    })
    child.on('close', (code) => {
      this.running.delete(k)
      this.exited.set(k, { code, log: entry.log })
      this.emit({ kind: 'command-exited', projectId, commandId, code })
    })
  }

  stop(projectId: string, commandId: string): void {
    const entry = this.running.get(key(projectId, commandId))
    if (!entry?.child.pid) return
    const pid = entry.child.pid
    try {
      // negative pid → the whole process group (shell + its children)
      if (process.platform !== 'win32') process.kill(-pid, 'SIGTERM')
      else entry.child.kill()
    } catch {
      entry.child.kill()
    }
    setTimeout(() => {
      if (!this.running.has(key(projectId, commandId))) return
      try {
        if (process.platform !== 'win32') process.kill(-pid, 'SIGKILL')
        else entry.child.kill('SIGKILL')
      } catch {
        /* already gone */
      }
    }, SIGKILL_GRACE_MS).unref()
  }

  /** Snapshot for a (re)attaching renderer: run state + backlog per command. */
  status(projectId: string): Record<string, CommandRunState> {
    const out: Record<string, CommandRunState> = {}
    for (const [k, r] of this.running) {
      const [pid, commandId] = k.split('\n')
      if (pid === projectId) {
        out[commandId] = { running: true, startedAt: r.startedAt, log: r.log }
      }
    }
    for (const [k, r] of this.exited) {
      const [pid, commandId] = k.split('\n')
      if (pid === projectId && !out[commandId]) {
        out[commandId] = { running: false, exitCode: r.code, log: r.log }
      }
    }
    return out
  }

  /** Kill everything (app quit). */
  stopAll(): void {
    for (const k of [...this.running.keys()]) {
      const [projectId, commandId] = k.split('\n')
      this.stop(projectId, commandId)
    }
  }
}

export const commandManager = new CommandManager()
