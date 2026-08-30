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

function buildUnavailablePrompt(entry: AssistantReviewTurnIndexEntry, files: AssistantDiffTurnFile[]): string {
    const changeLabel = files.length === 1
        ? `Changed ${files[0]!.target.displayPath}`
        : files.length > 1
            ? `${files.length} files changed`
            : ''
    if (entry.state === 'running') return changeLabel ? `Running turn · ${changeLabel}` : 'Running turn'
    if (entry.state === 'error') return changeLabel ? `Failed turn · ${changeLabel}` : 'Failed turn'
    if (entry.state === 'interrupted') return changeLabel ? `Interrupted turn · ${changeLabel}` : 'Interrupted turn'
    return changeLabel || 'Turn history unavailable'
}

function hasReviewTurnEvidence(turn: AssistantDiffTurn): boolean {
    return turn.promptAvailable
        || turn.responseAvailable
        || turn.changes.length > 0
        || turn.state !== 'completed'
}

function compareReviewTurnsNewestFirst(left: AssistantDiffTurn, right: AssistantDiffTurn): number {
    return right.number - left.number
        || right.createdAt.localeCompare(left.createdAt)
        || right.updatedAt.localeCompare(left.updatedAt)
        || right.id.localeCompare(left.id)
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
    const promptAvailable = Boolean(entry.prompt)
    const responseAvailable = Boolean(entry.response?.text.trim())
    const prompt = parsedPrompt.body.trim() || (entry.prompt ? 'Attachment prompt' : buildUnavailablePrompt(entry, files))
    const response = entry.response?.text.trim() || 'Agent did not respond'
    const historyUnavailable = !promptAvailable || !responseAvailable
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
        state: entry.state,
        reviewStatus: null,
        prompt,
        promptAvailable,
        promptAttachments: parsedPrompt.attachments,
        response,
        responseAvailable,
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

function mergeTurnDetail(summary: AssistantDiffTurn, detail: AssistantDiffTurn, detailLoaded: boolean): AssistantDiffTurn {
    const detailChangeKeys = new Set(detail.changes.map(changeKey))
    const changes = [
        ...detail.changes,
        ...summary.changes.filter((change) => !detailChangeKeys.has(changeKey(change)))
    ]
    const files = aggregateFiles(changes)
    const promptAvailable = summary.promptAvailable || detail.promptAvailable
    const responseAvailable = summary.responseAvailable || detail.responseAvailable
    return {
        ...summary,
        ...detail,
        id: summary.id,
        number: summary.number,
        state: summary.state,
        reviewStatus: null,
        prompt: detail.promptAvailable ? detail.prompt : summary.prompt,
        promptAvailable,
        promptAttachments: detail.promptAvailable ? detail.promptAttachments : summary.promptAttachments,
        response: detail.responseAvailable ? detail.response : summary.response,
        responseAvailable,
        agentLabel: summary.agentLabel || detail.agentLabel,
        historyUnavailable: !promptAvailable || !responseAvailable,
        detailLoaded,
        searchText: `${summary.searchText} ${detail.searchText}`,
        createdAt: summary.createdAt,
        updatedAt: summary.updatedAt.localeCompare(detail.updatedAt) >= 0 ? summary.updatedAt : detail.updatedAt,
        files,
        changes,
        additions: changes.reduce((sum, change) => sum + change.additions, 0),
        deletions: changes.reduce((sum, change) => sum + change.deletions, 0)
    }
}

function reconcileReviewTurns(turns: AssistantDiffTurn[], activeTurnId?: string | null): AssistantDiffTurn[] {
    const activeNumber = activeTurnId
        ? turns.find((turn) => turn.id === activeTurnId)?.number
        : undefined
    const byNumber = new Map<number, AssistantDiffTurn>()
    for (const turn of turns) {
        const existing = byNumber.get(turn.number)
        byNumber.set(turn.number, existing
            ? mergeTurnDetail(existing, turn, existing.detailLoaded === true || turn.detailLoaded === true)
            : turn)
    }
    const evidenced = [...byNumber.values()].filter(hasReviewTurnEvidence)
    const runningNumber = activeTurnId
        ? activeNumber ?? evidenced.find((turn) => turn.state === 'running')?.number
        : undefined
    evidenced.sort((left, right) => {
        if (runningNumber !== undefined) {
            if (left.number === runningNumber && right.number !== runningNumber) return -1
            if (right.number === runningNumber && left.number !== runningNumber) return 1
        }
        return compareReviewTurnsNewestFirst(left, right)
    })
    return evidenced.map((turn, index) => ({
        ...turn,
        reviewStatus: runningNumber === turn.number
            ? 'running'
            : runningNumber === undefined && !activeTurnId && index === 0
                ? 'latest'
                : null
    }))
}

export function mergeAssistantReviewIndex(input: {
    index: AssistantReviewIndex | null
    detailedTurns: AssistantDiffTurn[]
    hydratedTurnIds?: ReadonlySet<string>
    projectRootPath?: string | null
    activeTurnId?: string | null
}): AssistantDiffTurn[] {
    if (!input.index) {
        return reconcileReviewTurns(
            input.detailedTurns.map((turn) => ({ ...turn, detailLoaded: true })),
            input.activeTurnId
        )
    }

    const detailsById = new Map(input.detailedTurns.map((turn) => [turn.id, turn]))
    const indexedTurns = input.index.turns.map((entry) => {
        const summary = buildIndexTurn(entry, input.projectRootPath)
        const detail = takeMatchingTurnDetail(entry, detailsById)
        const detailLoaded = input.hydratedTurnIds ? input.hydratedTurnIds.has(entry.id) : true
        return detail ? mergeTurnDetail(summary, detail, detailLoaded) : summary
    })
    const unindexedDetails = [...detailsById.values()]
        .map((turn) => ({
            ...turn,
            detailLoaded: input.hydratedTurnIds ? input.hydratedTurnIds.has(turn.id) : true
        }))
    return reconcileReviewTurns([...indexedTurns, ...unindexedDetails], input.activeTurnId)
}
