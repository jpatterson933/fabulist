import path from 'node:path'
import { createRequire } from 'node:module'
import { app } from 'electron'

/**
 * In packaged builds the SDK resolves its native engine binary inside app.asar,
 * which child_process.spawn cannot execute (spawn gets no asar translation).
 * Resolve the binary ourselves and point at the asar-unpacked copy. Returns
 * undefined in dev, where the SDK's own resolution works.
 *
 * Shared by both the document agent (agent.ts) and the Skill Studio agent
 * (studioAgent.ts) so the resolution lives in exactly one place — neither agent
 * depends on the other, only on this util.
 */
export function resolveEngineBinary(): string | undefined {
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

/** Resolved once at module load — the CLI doesn't change mid-run. */
export const ENGINE_BINARY = resolveEngineBinary()
