import type {
    DevScopeCreatePullRequestInput,
    DevScopePullRequestDraftSource,
    DevScopePullRequestProvider,
    DevScopePullRequestSummary
} from '../../shared/contracts/devscope-git-contracts'

export type PullRequestState = 'open' | 'closed' | 'merged'

export type PullRequestInfo = DevScopePullRequestSummary & {
    updatedAt: string | null
    isCrossRepository?: boolean
    headRepositoryNameWithOwner?: string | null
    headRepositoryOwnerLogin?: string | null
}

export type BranchState = {
    cwd: string
    branch: string | null
    detached: boolean
    hasWorkingTreeChanges: boolean
    upstreamRef: string | null
    ahead: number
    behind: number
    remotes: Array<{ name: string; fetchUrl: string; pushUrl: string }>
}

export type BranchHeadContext = {
    headBranch: string
    headSelectors: string[]
    preferredHeadSelector: string
    remoteName: string | null
    headRepositoryNameWithOwner: string | null
    headRepositoryOwnerLogin: string | null
    isCrossRepository: boolean
}

export type EnsuredDraft = {
    title: string
    body: string
    source: DevScopePullRequestDraftSource
    provider?: DevScopePullRequestProvider
}

export type CreatePullRequestRequest = {
    baseBranch: string
    headSelector: string
    title: string
    body: string
    draft: boolean
}

export type DraftInput = DevScopeCreatePullRequestInput
