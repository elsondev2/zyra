import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import type { AssistantActivity } from '../src/shared/assistant/contracts'
import { buildCommandCheckpointMaps } from '../src/renderer/src/pages/assistant/assistant-command-checkpoint-index'
import { isCommandCheckpointActivity, findRelatedCommandActivityId, buildCommandCheckpointDisplayActivity } from '../src/renderer/src/pages/assistant/assistant-timeline-helpers'

function original(activities: AssistantActivity[]) {
    return { targetById: new Map(activities.filter(isCommandCheckpointActivity).map(activity => [activity.id, findRelatedCommandActivityId(activity, activities)])), displayById: new Map(activities.filter(isCommandCheckpointActivity).map(activity => [activity.id, buildCommandCheckpointDisplayActivity(activity, activities)])) }
}
const activities: AssistantActivity[] = Array.from({ length: 2400 }, (_, index) => {
    const jobId = `job-${index % 50}`
    const payload = index % 3 === 0 ? { args: { job_id: jobId, command: `command-${index}` } } : index % 3 === 1 ? { result: { details: { jobId } }, command: `command-${index}` } : { jobId, command: `command-${index}` }
    return { id: `activity-${index}`, kind: index % 4 === 0 ? 'command.checkpoint' : 'command', tone: 'tool', summary: `Activity ${index}`, turnId: index % 17 === 0 ? null : `turn-${index % 60}`, createdAt: new Date(Date.UTC(2026, 0, 1) + Math.floor(index / 3) * 1000).toISOString(), payload }
})
// Reverse encounter order exercises non-chronological input and timestamp ties.
activities.reverse()
activities.push({ ...activities[0]!, id: 'explicit-missing', kind: 'command.checkpoint', payload: { relatedCommandActivityId: 'unloaded' } })
activities.push({ ...activities[0]!, id: 'no-job', kind: 'command.checkpoint', payload: {} })
assert.deepEqual(buildCommandCheckpointMaps(activities), original(activities))
assert.deepEqual(buildCommandCheckpointMaps([]), original([]))
const candidate = (id: string, createdAt: string, turnId: string): AssistantActivity => ({ id, kind: 'command', tone: 'tool', summary: id, createdAt, turnId, payload: { jobId: 'tie-job', command: id } })
const tiedFirst = candidate('encounter-first', '2026-01-01T00:00:01.000Z', 'same-turn')
const tiedSecond = candidate('encounter-second', tiedFirst.createdAt, 'same-turn')
const newerOtherTurn = candidate('newer-other-turn', '2026-01-01T00:00:02.000Z', 'other-turn')
const future = candidate('future', '2026-01-01T00:00:04.000Z', 'same-turn')
const checkpoint: AssistantActivity = { ...candidate('tie-checkpoint', '2026-01-01T00:00:03.000Z', 'same-turn'), kind: 'command.checkpoint' }
const ties = [tiedFirst, tiedSecond, newerOtherTurn, future, checkpoint]
assert.deepEqual(buildCommandCheckpointMaps(ties), original(ties))
assert.equal(buildCommandCheckpointMaps(ties).targetById.get(checkpoint.id), tiedFirst.id)
assert.equal(buildCommandCheckpointMaps([tiedSecond, tiedFirst, newerOtherTurn, future, checkpoint]).targetById.get(checkpoint.id), tiedSecond.id)
const samples: Record<string, number[]> = { before: [], after: [] }
const sampleCount = process.argv.includes('--verify-only') ? 0 : 7
const warmups = sampleCount ? 2 : 0
for (let sample = -warmups; sample < sampleCount; sample++) {
    for (const mode of sample % 2 ? ['after', 'before'] : ['before', 'after']) {
        const start = performance.now()
        const maps = mode === 'before' ? original(activities) : buildCommandCheckpointMaps(activities)
        const elapsed = performance.now() - start
        assert.equal(maps.targetById.size, 602)
        if (sample >= 0) samples[mode]!.push(elapsed)
    }
}
const report = { protocol: { activities: activities.length, checkpoints: 602, samples: sampleCount, warmups, alternatingOrder: true, workload: 'Actual timeline checkpoint target/display calculation; no renderer/layout or provider' }, timesMs: samples, correctness: { identicalTargetsAndDisplay: true, legacyJobFields: true, sameTurnAndTimestampTies: true, explicitMissing: true, empty: true } }
const outputIndex = process.argv.indexOf('--output')
if (outputIndex >= 0) await writeFile(resolve(process.argv[outputIndex + 1]!), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
