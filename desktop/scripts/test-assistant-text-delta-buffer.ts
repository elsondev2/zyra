import assert from 'node:assert/strict'
import { AssistantTextDeltaBuffer } from '../src/main/assistant/assistant-text-delta-buffer'

const flushed: string[] = []
const buffer = new AssistantTextDeltaBuffer({
    flushDelayMs: 25,
    onFlush: (entry) => flushed.push(entry.delta)
})

const entry = {
    sessionId: 'session-1',
    threadId: 'thread-1',
    messageId: 'message-1',
    turnId: 'turn-1',
    occurredAt: '2026-08-27T00:00:00.000Z'
}

buffer.queue({ ...entry, delta: 'First' })
assert.deepEqual(flushed, ['First'], 'the first visible assistant text must not wait for the batching timer')

buffer.queue({ ...entry, delta: ' second' })
buffer.queue({ ...entry, delta: ' third' })
assert.deepEqual(flushed, ['First'], 'later high-frequency deltas remain batched')

await new Promise((resolve) => setTimeout(resolve, 40))
assert.deepEqual(flushed, ['First', ' second third'], 'the batching timer combines later deltas')

buffer.flush({ threadId: entry.threadId, messageId: entry.messageId })
buffer.queue({ ...entry, delta: 'Restarted' })
assert.deepEqual(flushed, ['First', ' second third', 'Restarted'], 'a completed message releases its first-delta state')

buffer.dispose()
console.log('assistant text delta buffer checks passed')
