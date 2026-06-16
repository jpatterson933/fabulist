import path from 'node:path'
import { COMMENTS_FILE, isManagedFile } from '@shared/doc'
import { relativeIfInside } from './pathGuards'
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
 *
 * `readRoots` are extra directories a *read-only* tool may reach into besides
 * `cwd` — never written to. The skill-test harness passes the skill's own plugin
 * folder here so a skill under test can read its bundled files (brand-voice.md,
 * style-guide.md, …) even though it runs in a throwaway sandbox cwd. Writes are
 * still confined to `cwd`, so a test can never mutate the skill it's exercising.
 */
export function decideTool(
  cwd: string,
  tool: string,
  input: Record<string, unknown>,
  readRoots: string[] = []
): ToolDecision {
  const value = toolPathInput(tool, input)
  const readOnly = isReadOnly(tool)

  if (typeof value === 'string') {
    const abs = path.resolve(cwd, value)
    const inside = relativeIfInside(cwd, abs)
    if (inside !== null) {
      const filePath = toPosix(inside)
      if (isManagedFile(filePath)) {
        return {
          kind: 'deny',
          message: `${COMMENTS_FILE} is managed by Fabulist. Reply in chat instead; the app records comment replies.`,
          filePath
        }
      }
      return readOnly ? { kind: 'allow', filePath } : { kind: 'ask', filePath }
    }
    // Outside cwd: a read-only tool may still reach a declared read root — the root
    // dir itself (to Glob/Grep the skill folder) or any file under it. Anything else
    // (writes, or reads with no matching root) escapes the project — deny. The
    // `abs === root` disjunct is load-bearing: relativeIfInside treats the root
    // itself as outside (so resolveInside can reject writes targeting a root), but
    // a read-only scan of the plugin-folder root is legitimate.
    if (readOnly && readRoots.some((root) => abs === path.resolve(root) || relativeIfInside(root, abs) !== null)) {
      return { kind: 'allow' }
    }
    return { kind: 'deny', message: 'File path is outside this document project.' }
  }

  // No path to escape-check (Bash, web/search tools, MCP tools without a path field).
  return readOnly ? { kind: 'allow' } : { kind: 'ask' }
}

function toPosix(value: string): string {
  return value.split(path.sep).join(path.posix.sep)
}
