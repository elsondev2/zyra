export type GitChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'unchanged'

export type GitLineMarkerType = 'added' | 'modified' | 'deleted'

export interface GitLineMarker {
    line: number
    type: GitLineMarkerType
}

export interface GitDiffSummary {
    status: GitChangeStatus
    additions: number
    deletions: number
    changedLines: number
    hasChanges: boolean
}

function countDiffChanges(diff: string): { additions: number; deletions: number } {
    let additions = 0
    let deletions = 0

    for (const line of diff.split('\n')) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
            additions += 1
        } else if (line.startsWith('-') && !line.startsWith('---')) {
            deletions += 1
        }
    }

    return { additions, deletions }
}

export function summarizeGitDiff(diff: string): GitDiffSummary {
    const safeDiff = String(diff || '')
    const hasDiffPayload = safeDiff.trim().length > 0 && safeDiff !== 'No changes'
    const { additions, deletions } = countDiffChanges(safeDiff)
    const changedLines = additions + deletions

    let status: GitChangeStatus = 'unchanged'
    if (hasDiffPayload) {
        if (/^rename from /m.test(safeDiff) || /^rename to /m.test(safeDiff)) {
            status = 'renamed'
        } else if (/^new file mode /m.test(safeDiff) || /^--- \/dev\/null/m.test(safeDiff)) {
            status = 'added'
        } else if (/^deleted file mode /m.test(safeDiff) || /^\+\+\+ \/dev\/null/m.test(safeDiff)) {
            status = 'deleted'
        } else if (changedLines > 0) {
            status = 'modified'
        }
    }

    return {
        status,
        additions,
        deletions,
        changedLines,
        hasChanges: hasDiffPayload && changedLines > 0
    }
}

export function parseUnifiedDiffMarkers(diff: string): GitLineMarker[] {
    if (!diff || diff === 'No changes') return []

    const markers = new Map<number, GitLineMarkerType>()
    const lines = diff.split('\n')
    let i = 0

    while (i < lines.length) {
        const line = lines[i]
        const hunkMatch = line.match(/^@@\s-\d+(?:,\d+)?\s\+(\d+)(?:,\d+)?\s@@/)
        if (!hunkMatch) {
            i += 1
            continue
        }

        let newLine = Number.parseInt(hunkMatch[1] || '1', 10)
        i += 1

        while (i < lines.length && !lines[i].startsWith('@@ ') && !lines[i].startsWith('diff --git ')) {
            const current = lines[i]

            if (current.startsWith(' ')) {
                newLine += 1
                i += 1
                continue
            }

            if (!current.startsWith('-') && !current.startsWith('+')) {
                i += 1
                continue
            }

            const anchorLine = Math.max(1, newLine)
            let removedCount = 0
            const addedLines: number[] = []

            while (i < lines.length && (lines[i].startsWith('-') || lines[i].startsWith('+'))) {
                const changeLine = lines[i]
                if (changeLine.startsWith('-')) {
                    removedCount += 1
                } else {
                    addedLines.push(Math.max(1, newLine))
                    newLine += 1
                }
                i += 1
            }

            if (removedCount > 0 && addedLines.length > 0) {
                for (const markerLine of addedLines) {
                    markers.set(markerLine, 'modified')
                }
                if (removedCount > addedLines.length) {
                    markers.set(anchorLine, 'deleted')
                }
            } else if (addedLines.length > 0) {
                for (const markerLine of addedLines) {
                    markers.set(markerLine, 'added')
                }
            } else if (removedCount > 0) {
                markers.set(anchorLine, 'deleted')
            }
        }
    }

    return Array.from(markers.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([lineNumber, type]) => ({ line: lineNumber, type }))
}
