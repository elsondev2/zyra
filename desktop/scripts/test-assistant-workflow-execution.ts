import assert from 'node:assert/strict'
import { createWorkflowReviewSeed } from '../src/renderer/src/reviews/agents-review-workflow-fixture'
import { projectWorkflowExecution, workflowCallError } from '../src/renderer/src/pages/assistant/assistant-workflow-execution'

const seed = createWorkflowReviewSeed()
const runs = Object.values(seed.snapshot.workflows)
const before = JSON.stringify(seed)
assert.ok(runs.some(run => projectWorkflowExecution(run).some(stage => stage.concurrent && stage.calls.length === 3)), 'the review includes a real three-way overlapping investigation')
assert.ok(runs.some(run => projectWorkflowExecution(run).every(stage => stage.calls.length === 1)), 'the review also includes ordinary sequential work')
for (const run of runs) {
    const stages = projectWorkflowExecution(run)
    assert.deepEqual(stages.flatMap(stage => stage.calls.map(call => call.callId)).sort(), Object.keys(run.calls).sort(), 'every recorded call is represented exactly once')
    for (const stage of stages) {
        if (stage.phase) assert.ok(stage.calls.every(call => call.phaseId === stage.phase!.phaseId))
        if (stage.concurrent) assert.ok(stage.calls.length >= 2 && stage.calls.every(call => call.startedAt), 'unstarted work is never labeled parallel')
    }
    if (['draft', 'queued', 'awaiting-approval'].includes(run.status)) assert.ok(stages.every(stage => !stage.concurrent && !stage.followsPrevious))
}
const sample = runs.find(run => run.status === 'completed')!
const unknownTiming = structuredClone(sample)
for (const phase of Object.values(unknownTiming.phases)) { phase.startedAt = null; phase.completedAt = null }
for (const call of Object.values(unknownTiming.calls)) { call.startedAt = null; call.completedAt = null }
assert.ok(projectWorkflowExecution(unknownTiming).every(stage => !stage.concurrent && !stage.followsPrevious), 'phase order alone cannot invent causality or concurrency')
const overlappingPhases = structuredClone(sample)
for (const phase of Object.values(overlappingPhases.phases)) { phase.startedAt = sample.startedAt; phase.completedAt = sample.completedAt }
assert.ok(projectWorkflowExecution(overlappingPhases).every(stage => !stage.followsPrevious), 'overlapping phases are not presented as sequential')
const orphan = Object.values(unknownTiming.calls)[0]!
orphan.phaseId = 'not-in-snapshot'
const orphanStage = projectWorkflowExecution(unknownTiming).at(-1)!
assert.equal(orphanStage.phase, null)
assert.equal(orphanStage.calls[0]?.callId, orphan.callId)
assert.equal(orphanStage.followsPrevious, false, 'unphased work does not acquire invented stage edges')
const failed = runs.find(run => run.status === 'failed')!
assert.ok(Object.values(failed.calls).some(call => workflowCallError(call) === failed.error?.message))
assert.equal(workflowCallError({ ...orphan, error: { message: 'Object error' } }), 'Object error')
assert.equal(workflowCallError({ ...orphan, error: 'String error' }), 'String error')
assert.equal(JSON.stringify(seed), before, 'the execution projection never mutates runtime data')
console.log('Workflow execution: phase ownership, actual concurrency, chronological edges, unknown timing, orphan calls and immutability passed')
