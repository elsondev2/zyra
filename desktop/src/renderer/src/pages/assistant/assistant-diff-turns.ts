import type { AssistantActivity, AssistantMessage, AssistantSessionTurnUsageEntry, FileChangeKind } from '@shared/assistant/contracts'
import { scanPatchFileSummaries } from '@/lib/diffRendering'
import { getAssistantRelativeFilePath } from './assistant-file-navigation'
import type { AssistantDiffTarget, AssistantDiffTurn } from './assistant-diff-types'
import {
    getActivityDiffStats,
    getActivityPatch,
    getActivityPaths,
    getCreatedFilePaths,
    parseUserMessageAttachments
} from './assistant-timeline-helpers'

function normalizePath(value: string): string {
    return value.trim().replace(/\\/g, '/').replace(/^\.\//, '')
}

function readChangeKind(activity: AssistantActivity, filePath: string, previousPath?: string): FileChangeKind | undefined {
    const candidates = new Set([filePath, previousPath].filter((value): value is string => Boolean(value)).map(normalizePath))
    const changes = Array.isArray(activity.payload?.changes) ? activity.payload.changes : []

    for (const value of changes) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue
        const change = value as Record<string, unknown>
        const paths = [change.path, change.filePath, change.file_path, change.previousPath, change.previous_path]
            .filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
            .map(normalizePath)
        if (!paths.some((entry) => candidates.has(entry))) continue
        if (change.kind === 'add' || change.kind === 'delete' || change.kind === 'update' || change.kind === 'move') {
            return change.kind
        }
    }

    return undefined
}

function readActivityStatus(activity: AssistantActivity): string {
    return String(activity.payload?.status || '').toLowerCase().replace(/[-_\s]/g, '')
}

function buildTarget(input: {
    activity: AssistantActivity
    turnId: string
    patch: string
    filePath: string
    previousPath?: string
    projectRootPath?: string | null
    isNew: boolean
}): AssistantDiffTarget {
    const status = readActivityStatus(input.activity)
    return {
        activityId: input.activity.id,
        turnId: input.turnId,
        filePath: input.filePath,
        displayPath: getAssistantRelativeFilePath(input.filePath, input.projectRootPath) || input.filePath,
        patch: input.patch,
        previousPath: input.previousPath,
        createdAt: input.activity.createdAt,
        isNew: input.isNew,
        changeKind: readChangeKind(input.activity, input.filePath, input.previousPath),
        provisional: status === 'running' || status === 'inprogress' || input.activity.payload?.authoritative !== true,
        truncated: input.activity.payload?.truncated === true,
        unavailableReason: typeof input.activity.payload?.diffUnavailableReason === 'string'
            ? input.activity.payload.diffUnavailableReason
            : undefined
    }
}

function normalizeText(value: string | null | undefined, fallback: string, preserveFormatting = false): string {
    const text = String(value || '').trim()
    if (!text) return fallback
    return preserveFormatting ? text : text.replace(/\s+/g, ' ')
}

function normalizeMessageText(
    message: AssistantMessage | undefined,
    fallback: string,
    preserveFormatting = false
): string {
    return normalizeText(message?.text, fallback, preserveFormatting)
}

function compareTimelineEntries(
    left: Pick<AssistantMessage | AssistantActivity, 'timelineSequence' | 'createdAt' | 'id'>,
    right: Pick<AssistantMessage | AssistantActivity, 'timelineSequence' | 'createdAt' | 'id'>
): number {
    if (left.timelineSequence !== undefined && right.timelineSequence !== undefined && left.timelineSequence !== right.timelineSequence) {
        return left.timelineSequence - right.timelineSequence
    }
    return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
}

type MutableReviewTurn = {
    id: string
    number?: number
    prompt: string
    promptAttachments: AssistantDiffTurn['promptAttachments']
    response: string
    historyUnavailable: boolean
    createdAt: string
    updatedAt: string
    changes: AssistantDiffTurn['changes']
    filesByPath: Map<string, AssistantDiffTarget>
    additionsByPath: Map<string, number>
    deletionsByPath: Map<string, number>
}

export function buildAssistantDiffTurns(input: {
    messages: AssistantMessage[]
    activities: AssistantActivity[]
    turns?: AssistantSessionTurnUsageEntry[]
    projectRootPath?: string | null
}): AssistantDiffTurn[] {
    const sortedMessages = input.messages.slice().sort(compareTimelineEntries)
    const sortedFileActivities = input.activities
        .filter((activity) => activity.kind === 'file-change' && readActivityStatus(activity) !== 'failed')
        .slice()
        .sort(compareTimelineEntries)
    const persistedTurns = (input.turns || [])
        .slice()
        .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt) || left.id.localeCompare(right.id))
    const persistedTurnNumberById = new Map(persistedTurns.map((turn, index) => [turn.id, index + 1]))
    const persistedTurnByRequestedAt = new Map(persistedTurns.map((turn) => [turn.requestedAt, turn]))
    const resolvePersistedTurnNumberAt = (createdAt: string): number => {
        let low = 0
        let high = persistedTurns.length
        while (low < high) {
            const middle = Math.floor((low + high) / 2)
            if (persistedTurns[middle].requestedAt <= createdAt) low = middle + 1
            else high = middle
        }
        return Math.max(1, low)
    }
    const mutableTurns = new Map<string, MutableReviewTurn>()

    for (let messageIndex = 0; messageIndex < sortedMessages.length; messageIndex += 1) {
        const prompt = sortedMessages[messageIndex]
        if (prompt.role !== 'user') continue

        let nextUserIndex = sortedMessages.length
        for (let index = messageIndex + 1; index < sortedMessages.length; index += 1) {
            if (sortedMessages[index]?.role === 'user') {
                nextUserIndex = index
                break
            }
        }
        const responseMessages = sortedMessages
            .slice(messageIndex + 1, nextUserIndex)
            .filter((message) => message.role === 'assistant')
        const parsedPrompt = parseUserMessageAttachments(prompt.text || '')
        const promptFallback = parsedPrompt.attachments.length > 0 ? 'Attachment prompt' : 'Message turn'
        const inferredMessageTurnId = responseMessages.find((message) => message.turnId)?.turnId || null
        const persistedPromptTurn = persistedTurnByRequestedAt.get(prompt.createdAt) || null
        const nextPrompt = sortedMessages[nextUserIndex]
        const inferredActivityTurnId = sortedFileActivities.find((activity) => (
            activity.createdAt >= prompt.createdAt
            && (!nextPrompt || activity.createdAt < nextPrompt.createdAt)
            && activity.turnId
        ))?.turnId || null
        const turnId = prompt.turnId || persistedPromptTurn?.id || inferredMessageTurnId || inferredActivityTurnId || `message:${prompt.id}`
        const matchingResponses = responseMessages.filter((message) => !message.turnId || message.turnId === turnId)
        const finalResponse = matchingResponses[matchingResponses.length - 1]
        const existing = mutableTurns.get(turnId)
        if (existing) {
            existing.number = existing.number || persistedTurnNumberById.get(turnId)
            existing.prompt = normalizeText(parsedPrompt.body, existing.prompt || promptFallback)
            existing.promptAttachments = parsedPrompt.attachments
            existing.response = normalizeMessageText(finalResponse, existing.response, true)
            existing.updatedAt = finalResponse?.updatedAt || finalResponse?.createdAt || existing.updatedAt
            continue
        }
        mutableTurns.set(turnId, {
            id: turnId,
            number: persistedTurnNumberById.get(turnId),
            prompt: normalizeText(parsedPrompt.body, promptFallback),
            promptAttachments: parsedPrompt.attachments,
            response: normalizeMessageText(finalResponse, 'No final response', true),
            historyUnavailable: false,
            createdAt: prompt.createdAt,
            updatedAt: finalResponse?.updatedAt || finalResponse?.createdAt || prompt.updatedAt || prompt.createdAt,
            changes: [],
            filesByPath: new Map(),
            additionsByPath: new Map(),
            deletionsByPath: new Map()
        })
    }

    for (const activity of sortedFileActivities) {
        const patch = getActivityPatch(activity)
        if (!patch) continue
        const turnId = activity.turnId || `activity:${activity.id}`
        const summaries = scanPatchFileSummaries(patch)
        const paths = summaries.length > 0
            ? summaries.map((summary) => ({
                path: summary.path,
                previousPath: summary.previousPath,
                additions: summary.additions,
                deletions: summary.deletions
            }))
            : getActivityPaths(activity).map((path) => ({
                path,
                previousPath: undefined,
                additions: getActivityDiffStats(activity)?.additions ?? 0,
                deletions: getActivityDiffStats(activity)?.deletions ?? 0
            }))
        if (paths.length === 0) continue

        let turn = mutableTurns.get(turnId)
        if (!turn) {
            turn = {
                id: turnId,
                number: persistedTurnNumberById.get(turnId),
                prompt: 'File-change activity',
                promptAttachments: [],
                response: 'Response history unavailable',
                historyUnavailable: true,
                createdAt: activity.createdAt,
                updatedAt: activity.createdAt,
                changes: [],
                filesByPath: new Map(),
                additionsByPath: new Map(),
                deletionsByPath: new Map()
            }
            mutableTurns.set(turnId, turn)
        }
        if (activity.createdAt > turn.updatedAt) turn.updatedAt = activity.createdAt

        const createdPaths = new Set(getCreatedFilePaths(activity).map(normalizePath))
        for (const summary of paths) {
            const normalizedPath = normalizePath(summary.path)
            const target = buildTarget({
                activity,
                turnId,
                patch,
                filePath: summary.path,
                previousPath: summary.previousPath,
                projectRootPath: input.projectRootPath,
                isNew: createdPaths.has(normalizedPath) || readChangeKind(activity, summary.path, summary.previousPath) === 'add'
            })
            turn.changes.push({
                target,
                additions: summary.additions,
                deletions: summary.deletions
            })
            turn.filesByPath.set(normalizedPath, target)
            turn.additionsByPath.set(normalizedPath, (turn.additionsByPath.get(normalizedPath) || 0) + summary.additions)
            turn.deletionsByPath.set(normalizedPath, (turn.deletionsByPath.get(normalizedPath) || 0) + summary.deletions)
        }
    }

    for (const persistedTurn of persistedTurns) {
        if (mutableTurns.has(persistedTurn.id)) continue
        mutableTurns.set(persistedTurn.id, {
            id: persistedTurn.id,
            number: persistedTurnNumberById.get(persistedTurn.id),
            prompt: 'Prompt history unavailable',
            promptAttachments: [],
            response: 'Response history unavailable',
            historyUnavailable: true,
            createdAt: persistedTurn.requestedAt,
            updatedAt: persistedTurn.updatedAt || persistedTurn.completedAt || persistedTurn.startedAt || persistedTurn.requestedAt,
            changes: [],
            filesByPath: new Map(),
            additionsByPath: new Map(),
            deletionsByPath: new Map()
        })
    }

    const chronological = [...mutableTurns.values()]
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))

    return chronological.map((turn, index) => {
        const files = [...turn.filesByPath.entries()].map(([path, target]) => ({
            target,
            additions: turn.additionsByPath.get(path) || 0,
            deletions: turn.deletionsByPath.get(path) || 0
        }))
        const number = turn.number || (persistedTurns.length > 0
            ? resolvePersistedTurnNumberAt(turn.createdAt)
            : index + 1)
        const additions = turn.changes.reduce((sum, file) => sum + file.additions, 0)
        const deletions = turn.changes.reduce((sum, file) => sum + file.deletions, 0)
        const fileSearchText = files.flatMap((file) => [
            file.target.filePath,
            file.target.displayPath,
            file.target.previousPath || '',
            file.target.changeKind || '',
            file.target.isNew ? 'new added created' : '',
            `${file.additions} additions`,
            `${file.deletions} deletions`
        ]).join(' ')
        const attachmentSearchText = turn.promptAttachments.flatMap((attachment) => [
            attachment.displayName,
            attachment.name,
            attachment.path || '',
            attachment.type,
            attachment.mime || ''
        ]).join(' ')
        const searchText = [
            turn.prompt,
            attachmentSearchText,
            turn.response,
            turn.historyUnavailable ? 'history unavailable missing stored message' : '',
            turn.id,
            `turn ${number}`,
            `#${number}`,
            `${files.length} files`,
            `${additions} additions`,
            `${deletions} deletions`,
            files.length > 0 ? 'changes changed files' : 'no changes unchanged',
            fileSearchText
        ].join(' ').toLowerCase()
        return {
            id: turn.id,
            number,
            prompt: turn.prompt,
            promptAttachments: turn.promptAttachments,
            response: turn.response,
            historyUnavailable: turn.historyUnavailable,
            searchText,
            createdAt: turn.createdAt,
            updatedAt: turn.updatedAt,
            files,
            changes: turn.changes,
            additions,
            deletions
        }
    }).reverse()
}
