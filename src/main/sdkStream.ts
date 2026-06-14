import type { AgentEvent } from '@shared/types'
import { describeTool } from './toolRegistry'

// The engine→UI translator, extracted from AgentManager.send so it is a pure,
// Electron-free async generator that can be unit-tested. The SDK's content-block
// shapes vary across patch releases and are read structurally here; pinning this
// in tests means an SDK bump that changes the shape fails a test instead of
// silently breaking streaming in the live app.

interface StreamEvent {
  type: string
  delta?: { type: string; text?: string }
}

interface ContentBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  is_error?: boolean
}

/** The fields of an SDK message this translator reads (structural, not the full SDK type). */
export interface SdkMessage {
  type: string
  session_id?: string
  event?: StreamEvent
  message?: { content?: ContentBlock[] | unknown }
  subtype?: string
  result?: string
  total_cost_usd?: number
  duration_ms?: number
}

/** Summary of a finished run, used for persistence and the final result event. */
export interface ParsedRun {
  sessionId?: string
  ok: boolean
  finalText: string
  error?: string
  costUsd?: number
  durationMs?: number
}

export interface ParseCtx {
  docId: string
  cwd: string
  newId: () => string
}

/**
 * Translate the SDK message stream into AgentEvents (yielded as they occur) and
 * return a ParsedRun summary when the stream ends.
 */
export async function* parseSdkMessages(
  messages: AsyncIterable<SdkMessage>,
  ctx: ParseCtx
): AsyncGenerator<AgentEvent, ParsedRun> {
  const { docId, cwd, newId } = ctx
  let currentItemId = newId()
  let streamedText = ''
  let finalText = ''
  const run: ParsedRun = { ok: false, finalText: '' }

  for await (const msg of messages) {
    if (msg.session_id) run.sessionId = msg.session_id

    switch (msg.type) {
      case 'stream_event': {
        const ev = msg.event
        if (ev?.type === 'message_start') {
          // a fresh assistant message begins
          if (streamedText) currentItemId = newId()
          streamedText = ''
        }
        if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
          streamedText += ev.delta.text
          yield { kind: 'text-delta', docId, itemId: currentItemId, delta: ev.delta.text }
          yield { kind: 'status', docId, status: 'working' }
        }
        break
      }
      case 'assistant': {
        const blocks = (Array.isArray(msg.message?.content) ? msg.message!.content : []) as ContentBlock[]
        const text = blocks
          .filter((b) => b.type === 'text')
          .map((b) => b.text ?? '')
          .join('\n')
        if (text.trim()) {
          yield { kind: 'assistant-text', docId, itemId: currentItemId, text }
          finalText = text
          streamedText = ''
        }
        for (const b of blocks) {
          if (b.type === 'tool_use' && b.id && b.name) {
            yield {
              kind: 'tool-note',
              docId,
              itemId: currentItemId,
              toolId: b.id,
              note: describeTool(b.name, (b.input ?? {}) as Record<string, unknown>, cwd)
            }
            yield { kind: 'status', docId, status: 'working', detail: b.name }
          }
        }
        break
      }
      case 'user': {
        // tool results come back as user messages
        const content = msg.message?.content
        if (Array.isArray(content)) {
          for (const b of content as ContentBlock[]) {
            if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
              yield {
                kind: 'tool-note',
                docId,
                itemId: currentItemId,
                toolId: b.tool_use_id,
                note: '',
                done: true,
                ok: !b.is_error
              }
            }
          }
        }
        break
      }
      case 'result': {
        run.ok = msg.subtype === 'success'
        if (msg.subtype === 'success') {
          if (msg.result?.trim()) finalText = msg.result
        } else if (msg.subtype) {
          run.error = msg.subtype.replace(/_/g, ' ')
        }
        run.costUsd = msg.total_cost_usd
        run.durationMs = msg.duration_ms
        break
      }
    }
  }

  run.finalText = finalText
  return run
}
