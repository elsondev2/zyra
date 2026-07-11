import type {
    FileTreeNode,
    GitBranchSummary,
    GitCommit,
    GitRemoteSummary,
    GitSyncStatus,
    GitStatusDetail,
    GitStashSummary,
    GitTagSummary
} from '../types'
import type { GitLifecycleDataState, GitView } from './types'

export const INCOMING_COMMITS_LIMIT = 50
export type GitRefreshMode = 'working' | 'history' | 'unpushed' | 'pulls' | 'full'

export async function yieldToBrowserPaint(): Promise<void> {
    await new Promise<void>((resolve) => {
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(() => resolve())
            return
        }
        setTimeout(resolve, 0)
    })
}

export function getRefreshModeForGitView(gitView: GitView): GitRefreshMode {
    if (gitView === 'changes') return 'working'
    if (gitView === 'history') return 'history'
    if (gitView === 'unpushed') return 'unpushed'
    if (gitView === 'pulls') return 'pulls'
    return 'full'
}

export function hasFocusedGitDataForView(input: GitLifecycleDataState): boolean {
    if (input.gitView === 'history') return input.gitHistoryTotalCount > 0 || input.gitHistory.length > 0
    if (input.gitView === 'changes') return input.gitStatusDetails.length > 0
    if (input.gitView === 'unpushed') {
        return input.unpushedCommits.length > 0 || input.gitSyncStatus !== null || input.hasRemote === false
    }
    if (input.gitView === 'pulls') {
        return input.incomingCommits.length > 0 || input.gitSyncStatus !== null || input.hasRemote === false
    }

    return hasVisibleGitData(input)
}

export function mergeCommitStats(previousCommits: GitCommit[], nextCommits: GitCommit[]): GitCommit[] {
    if (previousCommits.length === 0 || nextCommits.length === 0) {
        return nextCommits
    }

    const previousByHash = new Map(previousCommits.map((commit) => [commit.hash, commit]))
    return nextCommits.map((commit) => {
        const previous = previousByHash.get(commit.hash)
        if (!previous || previous.statsLoaded !== true) {
            return commit
        }

        return {
            ...commit,
            additions: previous.additions,
            deletions: previous.deletions,
            filesChanged: previous.filesChanged,
            statsLoaded: true
        }
    })
}

export function mergeGitStatusDetailStats(previousDetails: GitStatusDetail[], nextDetails: GitStatusDetail[]): GitStatusDetail[] {
    if (previousDetails.length === 0 || nextDetails.length === 0) {
        return nextDetails
    }

    const previousByPath = new Map(previousDetails.map((detail) => [detail.path.replace(/\\/g, '/'), detail]))
    return nextDetails.map((detail) => {
        const previous = previousByPath.get(detail.path.replace(/\\/g, '/'))
        if (!previous || previous.statsLoaded !== true) {
            return detail
        }

        return {
            ...detail,
            additions: previous.additions,
            deletions: previous.deletions,
            stagedAdditions: previous.stagedAdditions,
            stagedDeletions: previous.stagedDeletions,
            unstagedAdditions: previous.unstagedAdditions,
            unstagedDeletions: previous.unstagedDeletions,
            statsLoaded: true
        }
    })
}

export function hasVisibleGitData(input: Omit<GitLifecycleDataState, 'gitView'>): boolean {
    return input.isGitRepo === false
        || input.gitStatusDetails.length > 0
        || input.gitHistory.length > 0
        || input.gitHistoryTotalCount > 0
        || input.incomingCommits.length > 0
        || input.unpushedCommits.length > 0
        || input.gitUser !== null
        || input.repoOwner !== null
        || input.hasRemote !== null
        || input.gitSyncStatus !== null
        || input.branches.length > 0
        || input.remotes.length > 0
        || input.tags.length > 0
        || input.stashes.length > 0
}

export function parseRepoOwnerFromRemoteUrl(remoteUrl: string): string | null {
    const trimmed = String(remoteUrl || '').trim()
    if (!trimmed) return null

    const sshScpMatch = trimmed.match(/^[^@]+@[^:]+:([^/]+)\/.+$/)
    if (sshScpMatch?.[1]) return sshScpMatch[1]

    try {
        const url = new URL(trimmed)
        const segments = url.pathname.split('/').filter(Boolean)
        return segments[0] || null
    } catch {
        return null
    }
}

export function resolveRepoOwnerFromRemotes(remotes: GitRemoteSummary[]): string | null {
    const origin = remotes.find((remote) => remote.name === 'origin')
    const remoteUrl = origin?.fetchUrl || origin?.pushUrl || ''
    return parseRepoOwnerFromRemoteUrl(remoteUrl)
}

export function createEmptyGitStateMap(): Record<string, FileTreeNode['gitStatus']> {
    return {}
}

export type GitDataSnapshot = {
    isGitRepo: boolean | null
    gitStatusDetails: GitStatusDetail[]
    gitHistory: GitCommit[]
    gitHistoryTotalCount: number
    incomingCommits: GitCommit[]
    unpushedCommits: GitCommit[]
    gitUser: { name: string; email: string } | null
    repoOwner: string | null
    hasRemote: boolean | null
    gitSyncStatus: GitSyncStatus | null
    gitStatusMap: Record<string, FileTreeNode['gitStatus']>
    branches: GitBranchSummary[]
    remotes: GitRemoteSummary[]
    tags: GitTagSummary[]
    stashes: GitStashSummary[]
}
