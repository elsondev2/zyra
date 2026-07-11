import type { DevScopeGitHubPublishContext } from '@shared/contracts/devscope-api'

type BranchLike = {
    name: string
    isRemote: boolean
    isLocal?: boolean
}

type RemoteLike = {
    name: string
    pushUrl: string
}

type CommitLike = {
    hash: string
}

export type GitPublishPlan = {
    strategy: 'blocked' | 'direct-push' | 'publish-branch'
    remoteName: string | null
    hasRemote: boolean
    currentBranchNeedsPublish: boolean
    commitCount: number
    actionLabel: string
    title: string
    description: string
    summaryLines: string[]
}

export function getPreferredGitRemote<T extends RemoteLike>(remotes: T[]): T | null {
    return remotes.find((remote) => remote.name === 'origin' && String(remote.pushUrl || '').trim())
        ?? remotes.find((remote) => String(remote.pushUrl || '').trim())
        ?? null
}

function getSelectedCommitCount<T extends CommitLike>(commits: T[], selectedCommitHash?: string | null) {
    if (!selectedCommitHash) return commits.length
    const selectedIndex = commits.findIndex((commit) => commit.hash === selectedCommitHash)
    return selectedIndex >= 0 ? commits.slice(selectedIndex).length : 0
}

export function getCurrentBranchPublishState<TBranch extends BranchLike, TRemote extends RemoteLike>(args: {
    currentBranch: string
    branches: TBranch[]
    remotes: TRemote[]
}) {
    const remote = getPreferredGitRemote(args.remotes)
    const currentBranchMeta = args.branches.find((branch) => branch.name === args.currentBranch)
    const currentBranchNeedsPublish = Boolean(
        args.currentBranch
        && currentBranchMeta
        && currentBranchMeta.isLocal !== false
        && !currentBranchMeta.isRemote
    )

    return {
        remote,
        remoteName: remote?.name ?? null,
        hasRemote: Boolean(remote?.pushUrl),
        currentBranchNeedsPublish
    }
}

export function buildGitPublishPlan<TBranch extends BranchLike, TRemote extends RemoteLike, TCommit extends CommitLike>(args: {
    currentBranch: string
    branches: TBranch[]
    remotes: TRemote[]
    unpushedCommits: TCommit[]
    selectedCommitHash?: string | null
    additionalCommitsPlanned?: number
    intent?: 'push-all' | 'push-range'
    githubPublishContext?: DevScopeGitHubPublishContext | null
}): GitPublishPlan {
    const publishState = getCurrentBranchPublishState(args)
    const selectedCommitCount = getSelectedCommitCount(args.unpushedCommits, args.selectedCommitHash)
    const additionalCommitsPlanned = Math.max(0, Number(args.additionalCommitsPlanned || 0))
    const commitCount = selectedCommitCount + additionalCommitsPlanned
    const isPartialRange =
        args.intent === 'push-range'
        && selectedCommitCount > 0
        && selectedCommitCount < args.unpushedCommits.length

    if (!publishState.hasRemote) {
        return {
            strategy: 'blocked',
            remoteName: null,
            hasRemote: false,
            currentBranchNeedsPublish: false,
            commitCount: 0,
            actionLabel: 'Add Remote',
            title: 'Remote required',
            description: 'Add a remote before opening a pull request.',
            summaryLines: ['Add a remote repository before opening a pull request.']
        }
    }

    if (publishState.currentBranchNeedsPublish) {
        return {
            strategy: 'publish-branch',
            remoteName: publishState.remoteName,
            hasRemote: true,
            currentBranchNeedsPublish: true,
            commitCount,
            actionLabel: 'Publish Branch',
            title: 'Current branch is local only',
            description: `Publish "${args.currentBranch || 'current'}" before opening a PR.`,
            summaryLines: [
                `Current branch "${args.currentBranch || 'current'}" is local only.`,
                `Publish it to ${publishState.remoteName || 'remote'} before opening a PR.`
            ]
        }
    }

    if (commitCount > 0) {
        return {
            strategy: 'direct-push',
            remoteName: publishState.remoteName,
            hasRemote: true,
            currentBranchNeedsPublish: false,
            commitCount,
            actionLabel: isPartialRange ? `Review ${commitCount} Commit${commitCount === 1 ? '' : 's'}` : 'Review Local Commits',
            title: isPartialRange ? 'Selected local commit range' : 'Local commits',
            description: 'These local commits will be included when you create a PR from this branch.',
            summaryLines: [
                isPartialRange
                    ? `Selected ${commitCount} local commit${commitCount === 1 ? '' : 's'} for this branch.`
                    : `${commitCount} local commit${commitCount === 1 ? '' : 's'} are ready on this branch.`,
                'Create the PR when the branch is ready.'
            ]
        }
    }

    return {
        strategy: 'direct-push',
        remoteName: publishState.remoteName,
        hasRemote: true,
        currentBranchNeedsPublish: false,
        commitCount: 0,
        actionLabel: 'Create PR',
        title: 'Current branch',
        description: 'Create or reopen the GitHub pull request for the current branch.',
        summaryLines: ['Create or reopen the GitHub pull request for the current branch.']
    }
}

export function describeGitPublishSuccess(plan: GitPublishPlan, options?: { commitHash?: string; currentBranch?: string }) {
    if (plan.strategy === 'publish-branch') {
        return `Published branch "${options?.currentBranch || 'current'}" to ${plan.remoteName || 'remote'}.`
    }

    if (options?.commitHash) {
        return `Pushed selected local commits to ${plan.remoteName || 'remote'}.`
    }

    return `Pushed ${plan.commitCount} local commit${plan.commitCount === 1 ? '' : 's'} to ${plan.remoteName || 'remote'}.`
}
