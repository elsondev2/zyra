import type { UseProjectGitLifecycleParams } from './types'
import type { GitLifecycleDataState } from './types'
import type { GitRefreshMode } from './gitLifecycleUtils'

export function buildGitDataState(input: UseProjectGitLifecycleParams): GitLifecycleDataState {
    return {
        gitView: input.gitView,
        isGitRepo: input.isGitRepo,
        gitStatusDetails: input.gitStatusDetails,
        gitHistory: input.gitHistory,
        gitHistoryTotalCount: input.gitHistoryTotalCount,
        incomingCommits: input.incomingCommits,
        unpushedCommits: input.unpushedCommits,
        gitUser: input.gitUser,
        repoOwner: input.repoOwner,
        hasRemote: input.hasRemote,
        gitSyncStatus: input.gitSyncStatus,
        branches: input.branches,
        remotes: input.remotes,
        tags: input.tags,
        stashes: input.stashes
    }
}

export function buildGitDataStateFromSnapshot(
    gitView: UseProjectGitLifecycleParams['gitView'],
    snapshot: Record<string, any>
): GitLifecycleDataState {
    return {
        gitView,
        isGitRepo: typeof snapshot.isGitRepo === 'boolean' ? snapshot.isGitRepo : null,
        gitStatusDetails: Array.isArray(snapshot.gitStatusDetails) ? snapshot.gitStatusDetails : [],
        gitHistory: Array.isArray(snapshot.gitHistory) ? snapshot.gitHistory : [],
        gitHistoryTotalCount: typeof snapshot.gitHistoryTotalCount === 'number' ? snapshot.gitHistoryTotalCount : 0,
        incomingCommits: Array.isArray(snapshot.incomingCommits) ? snapshot.incomingCommits : [],
        unpushedCommits: Array.isArray(snapshot.unpushedCommits) ? snapshot.unpushedCommits : [],
        gitUser: snapshot.gitUser && typeof snapshot.gitUser === 'object' ? snapshot.gitUser : null,
        repoOwner: typeof snapshot.repoOwner === 'string' ? snapshot.repoOwner : null,
        hasRemote: typeof snapshot.hasRemote === 'boolean' ? snapshot.hasRemote : null,
        gitSyncStatus: snapshot.gitSyncStatus && typeof snapshot.gitSyncStatus === 'object' ? snapshot.gitSyncStatus : null,
        branches: Array.isArray(snapshot.branches) ? snapshot.branches : [],
        remotes: Array.isArray(snapshot.remotes) ? snapshot.remotes : [],
        tags: Array.isArray(snapshot.tags) ? snapshot.tags : [],
        stashes: Array.isArray(snapshot.stashes) ? snapshot.stashes : []
    }
}

export type GitRefreshRequest = {
    refreshFilesToo: boolean
    quiet: boolean
    mode: GitRefreshMode
}

export function collapseQueuedGitRefreshRequests(requests: GitRefreshRequest[]): GitRefreshRequest | null {
    if (requests.length === 0) return null

    const modes = Array.from(new Set(requests.map((request) => request.mode)))
    return {
        refreshFilesToo: requests.some((request) => request.refreshFilesToo),
        quiet: requests.every((request) => request.quiet),
        mode: modes.length === 1 ? modes[0] : 'full'
    }
}
