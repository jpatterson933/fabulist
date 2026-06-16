import { diffWordsWithSpace } from 'diff'
import type { PermissionRequest } from '@shared/types'
import { isPrimaryDoc } from '@shared/doc'

export interface SuggestSegment {
  kind: 'del' | 'ins'
  /** position in the CURRENT document */
  from: number
  /** del only: end position in the current document */
  to: number
  /** ins only: the text being inserted */
  text?: string
}

/**
 * Reconstruct what the document would look like if the pending request were
 * approved. Returns null when the request can't be rendered inline (old text
 * no longer present, non-file tool, etc.) — caller falls back to the chat card.
 */
export function buildProposed(current: string, req: PermissionRequest): string | null {
  if (req.tool === 'Write') {
    return req.after !== undefined && req.after !== current ? req.after : null
  }
  const edits =
    req.edits ??
    (req.tool === 'Edit' && req.before !== undefined
      ? [{ old: req.before, new: req.after ?? '', all: false }]
      : null)
  if (!edits || edits.length === 0) return null
  let out = current
  for (const e of edits) {
    if (!e.old || !out.includes(e.old)) return null
    // replacement via callback so `$` sequences in the new text stay literal
    out = e.all ? out.replaceAll(e.old, () => e.new) : out.replace(e.old, () => e.new)
  }
  return out === current ? null : out
}

/**
 * Word-level diff between current and proposed content, mapped onto positions
 * in the current document: deletions become strike-through ranges, insertions
 * become widgets anchored where the text would land.
 */
export function suggestionSegments(current: string, proposed: string): SuggestSegment[] {
  const raw = diffWordsWithSpace(current, proposed)

  // fold tiny unchanged islands (a stray "not" or " the ") sandwiched between
  // changes into the change itself, so a rewritten sentence reads as one
  // strike-through block + one insertion instead of a word-by-word interleave
  const parts: { added?: boolean; removed?: boolean; value: string }[] = []
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i]
    const changed = (x?: { added?: boolean; removed?: boolean }): boolean =>
      Boolean(x && (x.added || x.removed))
    if (!p.added && !p.removed && p.value.length < 12 && changed(raw[i - 1]) && changed(raw[i + 1])) {
      parts.push({ removed: true, value: p.value }, { added: true, value: p.value })
    } else {
      parts.push(p)
    }
  }

  // emit one del range + one ins widget per consecutive run of changes
  const segments: SuggestSegment[] = []
  let pos = 0
  let i = 0
  while (i < parts.length) {
    const p = parts[i]
    if (!p.added && !p.removed) {
      pos += p.value.length
      i++
      continue
    }
    const runStart = pos
    let delLen = 0
    let insText = ''
    while (i < parts.length && (parts[i].added || parts[i].removed)) {
      if (parts[i].removed) delLen += parts[i].value.length
      else insText += parts[i].value
      i++
    }
    if (delLen > 0) segments.push({ kind: 'del', from: runStart, to: runStart + delLen })
    if (insText) segments.push({ kind: 'ins', from: runStart + delLen, to: runStart + delLen, text: insText })
    pos = runStart + delLen
  }
  return segments
}

/**
 * The inline segments for a request against `current`, ignoring which file it
 * targets. The pure core shared by both the document editor and the Skill Studio —
 * each layers its own "which file?" gate on top (see computeSuggestion for the doc,
 * studioInlineEdit for the studio), so the diff math lives in exactly one place.
 */
export function inlineSegmentsFor(current: string, req: PermissionRequest): SuggestSegment[] | null {
  const proposed = buildProposed(current, req)
  if (proposed === null) return null
  const segments = suggestionSegments(current, proposed)
  return segments.length > 0 ? segments : null
}

export function computeSuggestion(current: string, req: PermissionRequest): SuggestSegment[] | null {
  if (!isPrimaryDoc(req.filePath)) return null
  return inlineSegmentsFor(current, req)
}
