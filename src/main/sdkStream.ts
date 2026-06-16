import type { AgentEvent, RunUsage } from '@shared/types'
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
  /** the `system`/`init` message reports the resolved model at top level */
  model?: string
  message?: { content?: ContentBlock[] | unknown; model?: string }
  subtype?: string
  result?: string
  total_cost_usd?: number
  duration_ms?: number
  num_turns?: number
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
}

/** Summary of a finished run, used for persistence and the final result event. */
export interface ParsedRun {
  sessionId?: string
  ok: boolean
  finalText: string
  error?: string
  costUsd?: number
  durationMs?: number
  usage?: RunUsage
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
  // the model the run actually resolved to — reported on the init message and on each
  // assistant message; we attach it to the run's usage so the studio can show it
  let model: string | undefined
  const run: ParsedRun = { ok: false, finalText: '' }

  for await (const msg of messages) {
    if (msg.session_id) run.sessionId = msg.session_id
    if (typeof msg.model === 'string' && msg.model) model = msg.model

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
        if (typeof msg.message?.model === 'string' && msg.message.model) model = msg.message.model
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
        if (msg.usage) {
          run.usage = {
            inputTokens: msg.usage.input_tokens ?? 0,
            outputTokens: msg.usage.output_tokens ?? 0,
            cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
            cacheCreationTokens: msg.usage.cache_creation_input_tokens ?? 0,
            costUsd: msg.total_cost_usd,
            numTurns: msg.num_turns,
            model
          }
        }
        break
      }
    }
  }

  run.finalText = finalText
  return run
}
