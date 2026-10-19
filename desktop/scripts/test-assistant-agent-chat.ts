import assert from 'node:assert/strict'
import type { AgentRunState, AgentTranscriptPage } from '../src/shared/assistant/contracts'
import { projectAssistantAgentChat } from '../src/renderer/src/pages/assistant/assistant-agent-chat-model'

const at = '2026-10-19T10:00:00.000Z'
const run = { agentRunId: 'test-agent', rootSessionId: 'root', status: 'completed', goal: 'Inspect the parser.', label: 'Parser review',
    createdAt: at, queuedAt: at, startedAt: at, completedAt: '2026-10-19T10:00:10.000Z', selectedModel: 'test/model',
    sessionFile: 'test-session.jsonl', result: null, activity: null, error: null } as AgentRunState
const entries: AgentTranscriptPage['entries'] = [
    { index: 0, timestamp: at, message: { role: 'user', content: 'Inspect the parser.' } },
    { index: 1, timestamp: at, message: { role: 'assistant', phase: 'commentary', content: [{ type: 'text', text: 'Checking the parser.' }, { type: 'thinking', thinking: 'never render private reasoning' }] } },
    { index: 2, timestamp: at, message: { role: 'assistant', content: [{ type: 'toolCall', id: 'read-parser', name: 'read', arguments: { path: 'src/parser.ts' } }] } },
    { index: 3, timestamp: at, message: { role: 'toolResult', toolCallId: 'read-parser', content: [{ type: 'text', text: 'never render raw output' }] } },
    { index: 4, timestamp: at, message: { role: 'assistant', phase: 'final_answer', content: 'Parser review complete.' } }
]
const page = (records = entries): AgentTranscriptPage => ({ entries: records, totalEntries: records.length, hydrated: records.length, bytes: 100, truncatedEntries: 0, nextBefore: null })
const completed = projectAssistantAgentChat(run, page())
const work = completed.rows.find(row => row.kind === 'turn-work-summary')
assert.equal(work?.kind, 'turn-work-summary')
if (work?.kind !== 'turn-work-summary') throw new Error('Expected shared Work summary.')
assert.equal(work.outcome, 'completed')
assert.equal(work.running, false)
assert.equal(work.rows[0]?.kind, 'message', 'narration remains in chronological Work order')
assert.equal(work.rows.some(row => row.kind === 'activity' || row.kind === 'activity-group'), true)
assert.equal(completed.rows.at(-1)?.kind, 'message', 'the final answer stays outside collapsed Work')
assert.equal(JSON.stringify(work.rows.filter(row => row.kind === 'message')).includes('never render'), false, 'private reasoning and raw tool evidence are not prose messages')
const beforeFinal = page(entries.slice(0, 4))
const running = projectAssistantAgentChat({ ...run, status: 'running', completedAt: null }, beforeFinal)
const liveWork = running.rows.find(row => row.kind === 'turn-work-summary')
assert.equal(liveWork?.kind === 'turn-work-summary' && liveWork.running, true)
assert.equal(running.rows.filter(row => row.kind === 'message' && row.message.role === 'assistant').length, 0, 'ongoing narration belongs inside Work')
const streamingFinal = projectAssistantAgentChat({ ...run, status: 'running', completedAt: null }, page())
const terminalVisible = streamingFinal.rows.find(row => row.kind === 'turn-work-summary')
assert.equal(terminalVisible?.kind === 'turn-work-summary' && terminalVisible.terminalResponseVisible, true, 'provider final-answer phase collapses Work before lifecycle settlement')
for (const status of ['interrupted', 'cancelled', 'failed'] as const) {
    const projected = projectAssistantAgentChat({ ...run, status }, beforeFinal)
    const summary = projected.rows.find(row => row.kind === 'turn-work-summary')
    assert.equal(summary?.kind === 'turn-work-summary' ? summary.outcome : null, status === 'failed' ? 'failed' : 'interrupted')
    assert.equal(projected.rows.some(row => row.kind === 'message' && row.message.role === 'assistant'), false, 'partial responses stay in Work after interruption or failure')
}
const stopped = projectAssistantAgentChat({ ...run, status: 'cancelled', error: { message: 'Stopped by root.', interruption: { kind: 'stopped', source: 'agent' } } }, null)
const stoppedWork = stopped.rows.find(row => row.kind === 'turn-work-summary')
assert.equal(stoppedWork?.kind === 'turn-work-summary' ? stoppedWork.interruptionLabel : null, 'Stopped by another agent')
const result = projectAssistantAgentChat({ ...run, sessionFile: null, result: { text: 'Immediate result.' } }, null)
assert.ok(result.resultFallbackId)
assert.equal(result.hasAssistant, true, 'an authoritative result does not require a saved transcript')
const duplicate = projectAssistantAgentChat({ ...run, result: { text: 'Parser review complete.' } }, page())
assert.equal(duplicate.resultFallbackId, null, 'saved final text and run result are not duplicated')
const beginning = projectAssistantAgentChat({ ...run, result: { text: 'Later final response.' } }, { ...page(entries.slice(0, 1)), totalEntries: 90, nextAfter: 0 })
assert.equal(beginning.resultFallbackId, null, 'a head page does not display the final result before unloaded middle history')
const partialHistory = projectAssistantAgentChat(run, { ...beforeFinal, totalEntries: 90, nextAfter: 3 })
const partialWork = partialHistory.rows.find(row => row.kind === 'turn-work-summary')
assert.equal(partialWork?.kind === 'turn-work-summary' && !partialWork.running, true, 'historical pages retain a shared collapsible Work group without claiming the completed run is working')
const historicalFailure = projectAssistantAgentChat({ ...run, status: 'failed' }, { ...page(entries.slice(0, 1)), totalEntries: 90, nextAfter: 0 })
assert.equal(JSON.stringify(historicalFailure.rows).includes('agent-outcome:'), false, 'terminal outcome markers remain after their actual history, not at the head page')
const workWithoutPrompt = page(entries.slice(1, 4))
const earlyHistory = projectAssistantAgentChat(run, { ...workWithoutPrompt, nextAfter: 3, totalEntries: 20 })
const withFollowup = projectAssistantAgentChat(run, { ...workWithoutPrompt, entries: [...workWithoutPrompt.entries, { index: 5, message: { role: 'user', content: 'A later follow-up.' } }], nextAfter: 5, totalEntries: 20 })
assert.ok(earlyHistory.fallbackTaskId)
assert.equal(withFollowup.fallbackTaskId, earlyHistory.fallbackTaskId, 'loading a later follow-up cannot remove the original task and move the top of the conversation')
const frozen = JSON.stringify(entries)
projectAssistantAgentChat({ ...run, status: 'interrupted' }, page())
assert.equal(JSON.stringify(entries), frozen, 'grouping never mutates saved transcript entries')
console.log('Agent chat: shared Work grouping, phases, interruption/failure states, result fallback and immutable transcripts passed')
