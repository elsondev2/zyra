import assert from 'node:assert/strict'
import { buildTimelineRows, getTimelineEntries } from '../src/renderer/src/pages/assistant/assistant-timeline-helpers'
import { groupTimelineRowsIntoWorkSummaries } from '../src/renderer/src/pages/assistant/assistant-turn-work'
import { projectThreadMessage } from '../src/shared/assistant/thread-message'
import { readAssistantPeerReply } from '../src/renderer/src/pages/assistant/assistant-peer-replies'
import { buildChildSystemPrompt } from '../../src/agents/runtime/child-session-factory.mjs'

const time = (second: number) => new Date(Date.UTC(2026, 9, 2, 10, 0, second)).toISOString()
const message = (id: string, role: 'user' | 'assistant', second: number, text = id, turnId: string | null = null) => ({ id, role, text, turnId, streaming: false, createdAt: time(second), updatedAt: time(second) })
const tool = (id: string, second: number, turnId: string | null = null) => ({ id, kind: 'file-read', tone: 'tool', summary: id, turnId, createdAt: time(second), payload: { status: 'completed' } }) as any
const sent = (second: number, extra = {}) => ({ id: `send-${second}`, kind: 'thread-collaboration', tone: 'tool', summary: 'Sent a message to another thread', detail: 'The adapter is implemented. Both checks passed.', turnId: null, createdAt: time(second), payload: { action: 'send', status: 'completed', args: { action: 'send', threadId: 'parent', prompt: 'The adapter is implemented. Both checks passed.' }, output: JSON.stringify({ messageId: `receipt-${second}`, recipientThreadId: 'parent', status: 'queued' }), ...extra } }) as any
function grouped(messages: any[], activities: any[], isWorking = false) {
    return groupTimelineRowsIntoWorkSummaries({ rows: buildTimelineRows(getTimelineEntries(messages, activities), isWorking, time(0)), messages, latestAssistantMessageId: messages.filter(message => message.role === 'assistant').at(-1)?.id || null, latestTurnStartedAt: time(0), isWorking })
}

const prompt = message('prompt', 'user', 0)
const narration = message('progress', 'assistant', 1, 'I will check this.')
const reply = sent(5)
const onlyReply = grouped([prompt, narration], [tool('read', 2), reply])
assert.deepEqual(onlyReply.map(row => row.kind), ['message', 'turn-work-summary', 'message'])
const ending = onlyReply.at(-1) as any
assert.equal(ending.message.text, reply.detail)
assert.equal(ending.peerReply.fallback, true)
assert.equal(ending.peerReply.messageId, 'receipt-5', 'Legacy SDK JSON recovers the exact receiving message id')
assert.equal(ending.peerReply.targetThreadId, 'parent')
assert.equal(ending.message.updatedAt, reply.createdAt)
assert.equal((onlyReply[1] as any).outcome, 'completed')
assert((onlyReply[1] as any).rows.some((row: any) => row.kind === 'message' && row.message.id === narration.id), 'Progress belongs inside work')
assert.equal(prompt.turnId, null, 'Presentation never mutates canonical task records')
const nextTask = message('next-task', 'user', 10, 'Check the next adapter.')
const laterPrompt = grouped([prompt, narration, nextTask], [tool('read', 2), reply, tool('next-read', 12)])
assert(laterPrompt.some(row => row.kind === 'message' && row.peerReply?.fallback && row.message.text === reply.detail), 'Recovered peer ending stays visible when another task follows')
assert.equal(laterPrompt.filter(row => row.kind === 'turn-work-summary').length, 2)

const final = message('final', 'assistant', 6, 'Finished the adapter and verified both checks.')
const both = grouped([prompt, narration, final], [tool('read', 2), reply])
assert.deepEqual(both.map(row => row.kind), ['message', 'turn-work-summary', 'message'])
assert.equal((both.at(-1) as any).message.id, 'final')
assert.equal((both.at(-1) as any).peerReply.fallback, false, 'Separate final retains the small outgoing reply card')
assert.equal(both.filter(row => row.kind === 'message' && row.message.role === 'assistant').length, 1)

const incoming = projectThreadMessage({ messageId: 'incoming', senderThreadId: 'parent', recipientThreadId: 'child', senderLabel: 'Zyra', text: 'Now check the second adapter.', createdAt: time(10) }, time(10))!
const repeatedTurnMessages = [message('task', 'user', 0, 'Check adapter', 'reused'), message('first-progress', 'assistant', 1, 'Checking first', 'reused'), message('second-progress', 'assistant', 11, 'Checking second', 'reused'), message('second-final', 'assistant', 15, 'Second adapter verified', 'reused')]
const split = grouped(repeatedTurnMessages, [tool('first-read', 2, 'reused'), incoming, tool('second-read', 12, 'reused')])
assert.equal(split.filter(row => row.kind === 'turn-work-summary').length, 2, 'Peer input splits reused historical turn ids into distinct work blocks')
assert(split.some(row => row.kind === 'message' && row.threadMessage?.id === incoming.id), 'Received instruction stays outside work')
assert(!split.some(row => row.kind === 'activity' || (row.kind === 'message' && ['first-progress', 'second-progress'].includes(row.message.id))), 'No loose intermediate actions or narration')

const noAnswer = grouped([prompt], [tool('read', 2)])
const partial = grouped([], [tool('partial-read', 2), tool('partial-edit', 3)])
assert.deepEqual(partial.map(row => row.kind), ['turn-work-summary'], 'A page beginning inside old work still collapses without a fabricated visible prompt')
const partialReply = grouped([], [tool('partial-read', 2), reply])
assert.deepEqual(partialReply.map(row => row.kind), ['turn-work-summary', 'message'])
assert.equal((partialReply.at(-1) as any).message.text, reply.detail, 'A partial legacy page can recover its sent result ending')
assert.equal((noAnswer.at(-1) as any).outcome, 'no-response', 'A stopped legacy task without a result does not imply success')
const stopped = grouped([prompt, narration], [tool('read', 2), { ...tool('stop', 4), turnTerminalOutcome: 'interrupted', payload: { interruption: { kind: 'stopped', source: 'agent' } } }])
assert.equal((stopped.at(-1) as any).interruptionLabel, 'Stopped by another agent')
assert.equal(stopped.filter(row => row.kind === 'turn-work-summary').length, 1)
assert(!grouped([prompt, narration], [reply], true).some(row => row.kind === 'message' && row.peerReply?.fallback), 'Live sends do not fabricate a final answer')
assert.equal(readAssistantPeerReply(sent(5, { status: 'failed' })), null)
assert.equal(readAssistantPeerReply(sent(5, { status: 'running' })), null)
assert.match(buildChildSystemPrompt(), /also end your own conversation with a concise, readable final response/)
console.log('PASS legacy/current agent tasks collapse narration and actions, preserve received boundaries, expose peer-only endings and exact reply destinations, and retain truthful terminal states')
