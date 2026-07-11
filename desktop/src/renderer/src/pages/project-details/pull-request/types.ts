import type { Settings } from '@/lib/settings'
import type { DevScopeGitHubPublishContext, DevScopePullRequestSummary } from '@shared/contracts/devscope-api'
import type { GitBranchSummary, GitCommit, GitRemoteSummary } from '../types'

export type ToastTone = 'success' | 'error' | 'info'

export type StatusMessage = {
    tone: ToastTone
    text: string
}

export type PullRequestModalProps = {
    isOpen: boolean
    onClose: () => void
    projectName: string
    projectPath: string
    currentBranch: string
    branches: GitBranchSummary[]
    remotes: GitRemoteSummary[]
    unstagedFiles: Array<{ path: string; name?: string }>
    stagedFiles: Array<{ path: string; name?: string }>
    unpushedCommits: GitCommit[]
    githubPublishContext?: DevScopeGitHubPublishContext | null
    settings: Settings
    updateSettings: (partial: Partial<Settings>) => void
    showToast: (message: string, actionLabel?: string, actionTo?: string, tone?: ToastTone) => void
    onCommitClick?: (commit: GitCommit) => void
    initialPullRequest?: DevScopePullRequestSummary | null
    onPullRequestResolved?: (pullRequest: DevScopePullRequestSummary | null) => void
}
