import type { AssistantActivity } from '@shared/assistant/contracts'
import { getActivityCommand, getCommandJobId, isCommandCheckpointActivity } from './assistant-timeline-helpers'

type Candidate = { activity: AssistantActivity; order: number }
type JobIndex = { all: Candidate[]; turns: Map<string, Candidate[]> }

function latestBefore(candidates: Candidate[], checkpoint: AssistantActivity): AssistantActivity | null {
    let low = 0, high = candidates.length
    while (low < high) {
        const middle = (low + high) >>> 1
        if (candidates[middle]!.activity.createdAt.localeCompare(checkpoint.createdAt) <= 0) low = middle + 1
        else high = middle
    }
    // Equal timestamps prefer the first encounter, as in the original scan.
    for (let index = low - 1; index >= 0; index--) {
        const activity = candidates[index]!.activity
        if (activity.id !== checkpoint.id) return activity
    }
    return null
}

export function buildCommandCheckpointMaps(activities: AssistantActivity[]): {
    targetById: Map<string, string | null>
    displayById: Map<string, AssistantActivity>
} {
    const targetById = new Map<string, string | null>()
    const displayById = new Map<string, AssistantActivity>()
    const checkpoints = activities.filter(isCommandCheckpointActivity)
    if (!checkpoints.length) return { targetById, displayById }
    const checkpointObjects = new Set(checkpoints)
    const byId = new Map<string, AssistantActivity>()
    const jobs = new Map<string, JobIndex>()
    for (let order = 0; order < activities.length; order++) {
        const activity = activities[order]!
        if (!byId.has(activity.id)) byId.set(activity.id, activity)
        if (checkpointObjects.has(activity)) continue
        const jobId = getCommandJobId(activity)
        if (!jobId) continue
        let job = jobs.get(jobId)
        if (!job) { job = { all: [], turns: new Map() }; jobs.set(jobId, job) }
        const candidate = { activity, order }
        job.all.push(candidate)
        if (activity.turnId) {
            let turn = job.turns.get(activity.turnId)
            if (!turn) { turn = []; job.turns.set(activity.turnId, turn) }
            turn.push(candidate)
        }
    }
    const orderCandidates = (left: Candidate, right: Candidate) => left.activity.createdAt.localeCompare(right.activity.createdAt) || right.order - left.order
    for (const job of jobs.values()) {
        job.all.sort(orderCandidates)
        for (const turn of job.turns.values()) turn.sort(orderCandidates)
    }
    for (const checkpoint of checkpoints) {
        const directValue = checkpoint.payload?.relatedCommandActivityId
        const direct = typeof directValue === 'string' ? directValue.trim() : ''
        const job = jobs.get(getCommandJobId(checkpoint))
        const sameTurn = checkpoint.turnId ? job?.turns.get(checkpoint.turnId) : undefined
        const relatedId = direct || (sameTurn ? latestBefore(sameTurn, checkpoint)?.id : null)
            || (job ? latestBefore(job.all, checkpoint)?.id : null) || null
        const related = relatedId ? byId.get(relatedId) : null
        targetById.set(checkpoint.id, relatedId)
        displayById.set(checkpoint.id, {
            ...checkpoint,
            payload: { ...(checkpoint.payload || {}), command: (related ? getActivityCommand(related) : '') || checkpoint.summary || 'Command follow-up', relatedCommandActivityId: relatedId || undefined }
        })
    }
    return { targetById, displayById }
}
