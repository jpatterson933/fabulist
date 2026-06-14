import { describe, expect, it } from 'vitest'
import { parseSdkMessages, type SdkMessage, type ParsedRun } from '../../../src/main/sdkStream'
import type { AgentEvent } from '../../../src/shared/types'

// Pins the engine→UI translation that used to be an untestable inline switch in
// AgentManager.send. Feeds structurally-shaped SDK messages and asserts the
// AgentEvents + run summary, so an SDK shape change fails here instead of
// silently breaking streaming.

async function run(messages: SdkMessage[]): Promise<{ events: AgentEvent[]; summary: ParsedRun }> {
  async function* stream(): AsyncGenerator<SdkMessage> {
    for (const m of messages) yield m
  }
  let n = 0
  const gen = parseSdkMessages(stream(), { docId: 'd', cwd: '/tmp/doc', newId: () => `id${++n}` })
  const events: AgentEvent[] = []
  let step = await gen.next()
  while (!step.done) {
    events.push(step.value)
    step = await gen.next()
  }
  return { events, summary: step.value }
}

describe('parseSdkMessages', () => {
  it('emits text deltas and working status, then captures the success result', async () => {
    const { events, summary } = await run([
      { type: 'stream_event', session_id: 's1', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } } },
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } } },
      { type: 'result', subtype: 'success', result: 'Hello', total_cost_usd: 0.01, duration_ms: 1200 }
    ])

    const deltas = events.filter((e) => e.kind === 'text-delta')
    expect(deltas.map((d) => (d as { delta: string }).delta)).toEqual(['Hel', 'lo'])
    expect(events.some((e) => e.kind === 'status' && e.status === 'working')).toBe(true)
    expect(summary).toMatchObject({ sessionId: 's1', ok: true, finalText: 'Hello', costUsd: 0.01, durationMs: 1200 })
  })

  it('emits a tool note when the assistant uses a tool, described via the registry', async () => {
    const { events } = await run([
      {
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'document.md' } }] }
      },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', is_error: false }] } }
    ])

    const start = events.find((e) => e.kind === 'tool-note' && !(e as { done?: boolean }).done)
    expect(start).toMatchObject({ toolId: 't1', note: 'Reading document.md' })
    const done = events.find((e) => e.kind === 'tool-note' && (e as { done?: boolean }).done)
    expect(done).toMatchObject({ toolId: 't1', done: true, ok: true })
  })

  it('reports a non-success result as a spaced-out error', async () => {
    const { summary } = await run([{ type: 'result', subtype: 'error_max_turns' }])
    expect(summary.ok).toBe(false)
    expect(summary.error).toBe('error max turns')
  })

  it('starts a new item id when a second assistant message streams after the first', async () => {
    const { events } = await run([
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'one' } } },
      { type: 'stream_event', event: { type: 'message_start' } },
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'two' } } }
    ])
    const deltas = events.filter((e) => e.kind === 'text-delta') as { itemId: string; delta: string }[]
    expect(deltas[0].delta).toBe('one')
    expect(deltas[1].delta).toBe('two')
    expect(deltas[0].itemId).not.toBe(deltas[1].itemId)
  })
})
