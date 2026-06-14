import path from 'node:path'
import { COMMENTS_FILE, isManagedFile } from '@shared/doc'
import { resolveInside } from './pathGuards'
import { isReadOnly, toolPathInput } from './toolRegistry'

export { isFileEditTool } from './toolRegistry'

export type ToolDecision =
  | { kind: 'allow'; filePath?: string }
  | { kind: 'ask'; filePath?: string }
  | { kind: 'deny'; message: string; filePath?: string }

/**
 * The pure approval policy for one tool call: deny path escapes and edits to
 * app-managed files, auto-allow read-only tools, and ask for everything else.
 * Tool classification and path lookup come from the tool registry, so adding a
 * tool there is the only edit needed.
 */
export function decideTool(cwd: string, tool: string, input: Record<string, unknown>): ToolDecision {
  const filePath = resolveToolFile(cwd, toolPathInput(tool, input))
  if (filePath.kind === 'deny') return filePath
  if (isManagedFile(filePath.filePath)) {
    return {
      kind: 'deny',
      message: `${COMMENTS_FILE} is managed by Fabulist. Reply in chat instead; the app records comment replies.`,
      filePath: filePath.filePath
    }
  }
  if (isReadOnly(tool)) return { kind: 'allow', filePath: filePath.filePath }
  return { kind: 'ask', filePath: filePath.filePath }
}

function resolveToolFile(
  cwd: string,
  value: unknown
): { kind: 'ok'; filePath?: string } | { kind: 'deny'; message: string } {
  if (typeof value !== 'string') return { kind: 'ok' }
  try {
    return { kind: 'ok', filePath: toPosix(resolveInside(cwd, value).relative) }
  } catch {
    return { kind: 'deny', message: 'File path is outside this document project.' }
  }
}

function toPosix(value: string): string {
  return value.split(path.sep).join(path.posix.sep)
}
