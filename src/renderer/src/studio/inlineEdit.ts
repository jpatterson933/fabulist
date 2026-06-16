import type { PermissionRequest } from '@shared/types'
import { inlineSegmentsFor, type SuggestSegment } from '@/lib/suggest'

/**
 * The pending authoring edit to render inline in the Skill Studio editor: the first
 * permission request that targets the file currently open and whose diff can be
 * reconstructed against the buffer. This mirrors the document app's in-editor
 * suggestion (Editor.tsx → computeSuggestion), but keyed on the studio's openFilePath
 * instead of the primary document — the two paths share only the pure diff core
 * (inlineSegmentsFor), so neither app reaches into the other's state.
 *
 * Returns null when nothing applies (no file open, the edit targets a different file,
 * or the old text is no longer present) — the chat ApprovalCard then shows the full
 * diff, exactly as it does today.
 */
export function studioInlineEdit(
  fileContent: string,
  openFilePath: string | null,
  permissions: PermissionRequest[]
): { requestId: string; segments: SuggestSegment[] } | null {
  if (!openFilePath) return null
  for (const req of permissions) {
    if (req.filePath !== openFilePath) continue
    const segments = inlineSegmentsFor(fileContent, req)
    if (segments) return { requestId: req.requestId, segments }
  }
  return null
}
