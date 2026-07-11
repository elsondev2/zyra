import type { GitCommit } from '../types'
import type { PreviewRow, PushRangeSummary } from './types'

const RETAINED_COLOR = 'bg-amber-400'
const SELECTED_COLOR = 'bg-blue-400'
const INCLUDED_COLOR = 'bg-emerald-400'

export function buildPushRangeSummary(commits: GitCommit[], commitHash: string): PushRangeSummary | null {
    const selectedIndex = commits.findIndex((commit) => commit.hash === commitHash)
    if (selectedIndex < 0) {
        return null
    }

    return {
        selectedCommit: commits[selectedIndex],
        newerLocalCommits: commits.slice(0, selectedIndex),
        commitsToPush: commits.slice(selectedIndex)
    }
}

export function formatCommitCount(count: number, singular: string, plural = `${singular}s`) {
    return `${count} ${count === 1 ? singular : plural}`
}

export function buildPreviewRows(summary: PushRangeSummary, compact: boolean, showCloudBoundary: boolean): PreviewRow[] {
    if (!compact) {
        const rows: PreviewRow[] = [
            ...summary.newerLocalCommits.map((commit) => ({ kind: 'commit' as const, commit, role: 'retained' as const })),
            { kind: 'commit' as const, commit: summary.selectedCommit, role: 'selected' as const },
            ...summary.commitsToPush.slice(1).map((commit) => ({ kind: 'commit' as const, commit, role: 'included' as const }))
        ]

        if (showCloudBoundary) {
            rows.push({ kind: 'cloud-boundary' })
        }

        return rows
    }

    const retainedPreview = summary.newerLocalCommits.slice(0, 2)
    const includedPreview = summary.commitsToPush.slice(1, 3)
    const hiddenRetained = Math.max(0, summary.newerLocalCommits.length - retainedPreview.length)
    const hiddenIncluded = Math.max(0, (summary.commitsToPush.length - 1) - includedPreview.length)

    const rows: PreviewRow[] = []

    if (hiddenRetained > 0) {
        rows.push({ kind: 'collapsed-local', count: hiddenRetained })
    }

    retainedPreview.forEach((commit) => {
        rows.push({ kind: 'commit', commit, role: 'retained' })
    })

    rows.push({ kind: 'commit', commit: summary.selectedCommit, role: 'selected' })

    includedPreview.forEach((commit) => {
        rows.push({ kind: 'commit', commit, role: 'included' })
    })

    if (hiddenIncluded > 0) {
        rows.push({ kind: 'collapsed-push', count: hiddenIncluded })
    }

    if (showCloudBoundary) {
        rows.push({ kind: 'cloud-boundary' })
    }

    return rows
}

export function getRoleTone(role: 'retained' | 'selected' | 'included') {
    if (role === 'retained') {
        return {
            dotClassName: RETAINED_COLOR,
            lineClassName: 'bg-amber-400/60',
            badgeClassName: 'border border-amber-400/20 bg-amber-400/12 text-amber-200',
            badgeLabel: 'Stays local',
            rowClassName: 'border border-amber-400/15 bg-amber-400/6 hover:bg-amber-400/10'
        }
    }

    if (role === 'selected') {
        return {
            dotClassName: SELECTED_COLOR,
            lineClassName: 'bg-blue-400/70',
            badgeClassName: 'border border-blue-400/20 bg-blue-400/12 text-blue-100',
            badgeLabel: 'Push target',
            rowClassName: 'border border-blue-400/20 bg-blue-400/8 hover:bg-blue-400/12'
        }
    }

    return {
        dotClassName: INCLUDED_COLOR,
        lineClassName: 'bg-emerald-400/60',
        badgeClassName: 'border border-emerald-400/20 bg-emerald-400/12 text-emerald-100',
        badgeLabel: 'Included',
        rowClassName: 'border border-emerald-400/15 bg-emerald-400/5 hover:bg-emerald-400/10'
    }
}
