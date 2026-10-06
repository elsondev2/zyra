import assert from 'node:assert/strict'
import { mock } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AssistantMessage, AssistantActivity } from '../src/shared/assistant/contracts'
import { buildTimelineRows, getTimelineEntries } from '../src/renderer/src/pages/assistant/assistant-timeline-helpers'
import { groupTimelineRowsIntoWorkSummaries } from '../src/renderer/src/pages/assistant/assistant-turn-work'
mock.module('../src/renderer/src/lib/settings', () => ({ useSettings: () => ({ settings: { assistantAllowCollapseWhileWorking: false } }) }))
const { TimelineTurnWorkSummary } = await import('../src/renderer/src/pages/assistant/AssistantTimelineWorkSummary')
const at = '2026-10-06T10:00:00.000Z'
const user: AssistantMessage = { id: 'user-phase', role: 'user', text: 'Repair the render', turnId: 'phase-turn', streaming: false, createdAt: at, updatedAt: at }
const action: AssistantActivity = { id: 'phase-action', kind: 'command', tone: 'tool', summary: 'Checking render', turnId: user.turnId, createdAt: '2026-10-06T10:00:01.000Z', payload: { status: 'running' } }
const response: AssistantMessage = { id: 'response-phase', role: 'assistant', text: '', turnId: user.turnId, streaming: true, phase: 'final_answer', createdAt: '2026-10-06T10:00:02.000Z', updatedAt: at }
function project(message: AssistantMessage) {
    const messages = [user, message]
    return groupTimelineRowsIntoWorkSummaries({ rows: buildTimelineRows(getTimelineEntries(messages, [action]), true, at), messages,
        isWorking: true, latestTurnStartedAt: at, latestAssistantMessageId: message.id })
}
for (const text of ['', 'The renderer is fixed.']) {
    const rows = project({ ...response, text })
    const work = rows.find(row => row.kind === 'turn-work-summary')
    assert.ok(work?.kind === 'turn-work-summary')
    assert.equal(work.terminalResponseVisible, true, 'the provider phase collapses work before any final text or turn completion')
    assert.equal(work.running, true, 'a final-response phase does not complete the owning turn')
    assert.equal(work.outcome, null)
    assert.ok(work.rows.every(row => row.kind !== 'message' || row.message.id !== response.id), 'streaming final text stays outside Work')
    if (text) assert.ok(rows.some(row => row.kind === 'message' && row.message.id === response.id))
}
const narration = project({ ...response, phase: 'commentary', text: 'A literal final_answer tag in narration.' })
assert.ok(narration.some(row => row.kind === 'turn-work-summary' && !row.terminalResponseVisible), 'narration and textual markers do not collapse work')
const markup = renderToStaticMarkup(<TimelineTurnWorkSummary startedAt={at} completedAt={null} running collapseForTerminalResponse renderChildren={() => <div>Checks</div>} />)
assert.match(markup, /aria-expanded="false"/, 'the ongoing-work preference allows the final-response collapse')
assert.doesNotMatch(markup, /disabled=""/, 'the collapsed work can be reopened while the response streams')
assert.match(markup, /data-assistant-working-dots="true"/, 'turn activity remains visible until the real completion event')
console.log('Final phase timeline: immediate collapse, visible streamed answer, unchanged live turn ownership: ok')
