import type { AssistantReviewIndex, AssistantReviewTurnIndexEntry } from '@shared/assistant/contracts'
import { getAssistantRelativeFilePath } from './assistant-file-navigation'
import type { AssistantDiffTurn, AssistantDiffTurnFile } from './assistant-diff-types'
import { parseUserMessageAttachments } from './assistant-timeline-helpers'

function changeKey(file: AssistantDiffTurnFile): string {
    return `${file.target.activityId}:${file.target.filePath.replace(/\\/g, '/').toLowerCase()}`
}

function aggregateFiles(changes: AssistantDiffTurnFile[]): AssistantDiffTurnFile[] {
    const byPath = new Map<string, AssistantDiffTurnFile>()
    for (const change of changes) {
        const path = change.target.filePath.replace(/\\/g, '/').toLowerCase()
        const existing = byPath.get(path)
        byPath.set(path, existing
            ? {
                target: change.target,
                additions: existing.additions + change.additions,
                deletions: existing.deletions + change.deletions
            }
            : change)
    }
    return [...byPath.values()]
}

function buildIndexTurn(entry: AssistantReviewTurnIndexEntry, projectRootPath?: string | null): AssistantDiffTurn {
    const parsedPrompt = parseUserMessageAttachments(entry.prompt?.text || '')
    const changes: AssistantDiffTurnFile[] = entry.changes.map((change) => ({
        target: {
            activityId: change.activityId,
            turnId: entry.id,
            filePath: change.filePath,
            displayPath: getAssistantRelativeFilePath(change.filePath, projectRootPath) || change.filePath,
            patch: '',
            previousPath: change.previousPath,
            createdAt: change.createdAt,
            isNew: change.isNew,
            changeKind: change.changeKind,
            provisional: change.status === 'running' || !change.authoritative,
            truncated: change.truncated,
            unavailableReason: change.unavailableReason
        },
        additions: change.additions,
        deletions: change.deletions
    }))
    const files = aggregateFiles(changes)
    const additions = changes.reduce((sum, change) => sum + change.additions, 0)
    const deletions = changes.reduce((sum, change) => sum + change.deletions, 0)
    const prompt = parsedPrompt.body.trim() || (entry.prompt ? 'Attachment prompt' : 'Prompt unavailable')
    const response = entry.response?.text.trim() || 'No final response'
    const historyUnavailable = !entry.prompt && !entry.response
    const searchText = [
        entry.id,
        `turn ${entry.number}`,
        `#${entry.number}`,
        prompt,
        response,
        entry.agentLabel,
        ...changes.flatMap((change) => [change.target.filePath, change.target.previousPath || '', change.target.changeKind || ''])
    ].join(' ').toLowerCase()

    return {
        id: entry.id,
        number: entry.number,
        prompt,
        promptAttachments: parsedPrompt.attachments,
        response,
        agentLabel: entry.agentLabel,
        historyUnavailable,
        detailLoaded: false,
        searchText,
        createdAt: entry.requestedAt,
        updatedAt: entry.updatedAt,
        files,
        changes,
        additions,
        deletions
    }
}

function takeMatchingTurnDetail(
    entry: AssistantReviewTurnIndexEntry,
    detailsById: Map<string, AssistantDiffTurn>
): AssistantDiffTurn | undefined {
    const candidateIds = [
        entry.id,
        entry.prompt?.id ? `message:${entry.prompt.id}` : null
    ]
    for (const candidateId of candidateIds) {
        if (!candidateId) continue
        const detail = detailsById.get(candidateId)
        if (!detail) continue
        detailsById.delete(candidateId)
        return detail
    }
    return undefined
}

function mergeTurnDetail(summary: AssistantDiffTurn, detail: AssistantDiffTurn): AssistantDiffTurn {
    const detailChangeKeys = new Set(detail.changes.map(changeKey))
    const changes = [
        ...detail.changes,
        ...summary.changes.filter((change) => !detailChangeKeys.has(changeKey(change)))
    ]
    const files = aggregateFiles(changes)
    return {
        ...summary,
        ...detail,
        id: summary.id,
        number: summary.number,
        prompt: detail.historyUnavailable ? summary.prompt : detail.prompt,
        promptAttachments: detail.historyUnavailable ? summary.promptAttachments : detail.promptAttachments,
        response: detail.historyUnavailable ? summary.response : detail.response,
        agentLabel: summary.agentLabel,
        historyUnavailable: summary.historyUnavailable && detail.historyUnavailable,
        detailLoaded: true,
        searchText: `${summary.searchText} ${detail.searchText}`,
        createdAt: summary.createdAt,
        updatedAt: summary.updatedAt.localeCompare(detail.updatedAt) >= 0 ? summary.updatedAt : detail.updatedAt,
        files,
        changes,
        additions: changes.reduce((sum, change) => sum + change.additions, 0),
        deletions: changes.reduce((sum, change) => sum + change.deletions, 0)
    }
}

export function mergeAssistantReviewIndex(input: {
    index: AssistantReviewIndex | null
    detailedTurns: AssistantDiffTurn[]
    projectRootPath?: string | null
}): AssistantDiffTurn[] {
    if (!input.index) return input.detailedTurns.map((turn) => ({ ...turn, detailLoaded: true }))

    const detailsById = new Map(input.detailedTurns.map((turn) => [turn.id, turn]))
    const indexedTurns = input.index.turns.map((entry) => {
        const summary = buildIndexTurn(entry, input.projectRootPath)
        const detail = takeMatchingTurnDetail(entry, detailsById)
        return detail ? mergeTurnDetail(summary, detail) : summary
    })
    const unindexedDetails = [...detailsById.values()]
        .map((turn) => ({ ...turn, detailLoaded: true }))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id))
    return [...unindexedDetails, ...indexedTurns]
}
