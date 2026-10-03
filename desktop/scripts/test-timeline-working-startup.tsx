import assert from 'node:assert/strict'
import { mock, setSystemTime } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { TimelineWorkingIndicator } from '../src/renderer/src/pages/assistant/AssistantTimelineWorkingIndicator'
import { buildTimelineRows, getTimelineEntries } from '../src/renderer/src/pages/assistant/assistant-timeline-helpers'
import { groupTimelineRowsIntoWorkSummaries } from '../src/renderer/src/pages/assistant/assistant-turn-work'
import type { AssistantActivity, AssistantMessage } from '../src/shared/assistant/contracts'

mock.module('../src/renderer/src/lib/settings', () => ({ useSettings: () => ({ settings: { assistantShowActionStats: false, assistantAllowCollapseWhileWorking: false } }) }))
const { TimelineTurnWorkSummary } = await import('../src/renderer/src/pages/assistant/AssistantTimelineWorkSummary')
const startedAt = '2026-09-29T12:00:00.000Z'
setSystemTime(new Date('2026-09-29T12:00:09.000Z'))
try {
    const startup = renderToStaticMarkup(<TimelineWorkingIndicator startedAt={startedAt} />)
    assert.match(startup, /Working for 9s/, 'real working feedback and elapsed time remain visible')
    assert.match(startup, /data-assistant-working-dots="true"/, 'startup retains the same quiet activity dots')
    assert.doesNotMatch(startup, /lucide-chevron|<button|aria-expanded|aria-controls/, 'startup is not a pretend dropdown before updates exist')
    assert.doesNotMatch(startup, /h-px|border-b|data-assistant-work-summary-shell/, 'startup has no divider or expandable-work wrapper')
    assert.match(startup, /data-assistant-working-indicator="true"/)
    assert.match(renderToStaticMarkup(<TimelineWorkingIndicator label="Connecting..." startedAt={startedAt} />), /Connecting for 9s/)
    assert.match(renderToStaticMarkup(<TimelineWorkingIndicator />), /Working\.\.\./)

    const user: AssistantMessage = { id: 'startup-user', role: 'user', text: 'Check the file', turnId: 'startup-turn', streaming: false, createdAt: startedAt, updatedAt: startedAt }
    const update: AssistantActivity = { id: 'startup-action', kind: 'command', tone: 'tool', summary: 'Running checks', turnId: user.turnId, createdAt: '2026-09-29T12:00:10.000Z', payload: { status: 'running', toolName: 'bash', command: 'bun test' } }
    const pipeline = (activities: AssistantActivity[]) => groupTimelineRowsIntoWorkSummaries({
        rows: buildTimelineRows(getTimelineEntries([user], activities), true, startedAt), messages: [user],
        latestAssistantMessageId: null, latestTurnStartedAt: startedAt, isWorking: true
    })
    assert.deepEqual(pipeline([]).map(row => row.kind), ['message', 'working'], 'no empty work disclosure is projected before an update')
    const liveRows = pipeline([update])
    assert.deepEqual(liveRows.map(row => row.kind), ['message', 'turn-work-summary'], 'the first real update goes straight into the actual Work state')
    const work = liveRows[1]!
    assert.ok(work.kind === 'turn-work-summary' && work.rows.length > 0 && work.running)
    const settled = renderToStaticMarkup(<TimelineTurnWorkSummary startedAt={startedAt} completedAt="2026-09-29T12:00:10.000Z" running={false} hasWork renderChildren={() => <div>Actual updates</div>} />)
    assert.match(settled, /data-assistant-work-summary-shell="true"/)
    assert.match(settled, /<button/)
    assert.match(settled, /aria-expanded="false"/)
    assert.match(settled, /lucide-chevron-right/, 'real settled work remains expandable')
    console.log('Working startup: plain timed status without fake disclosure/divider; first update and settled Work disclosure preserved: ok')
} finally {
    setSystemTime()
}
