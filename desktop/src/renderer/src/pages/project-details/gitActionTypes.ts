import type { FileTreeNode, GitCommit, GitStatusDetail } from './types'

export type RefreshGitOptions = {
    quiet?: boolean
    mode?: 'working' | 'unpushed' | 'pulls' | 'full'
}

export interface GitActionParams {
    decodedPath: string
    commitMessage: string
    changedFiles: Array<{ path: string }>
    stagedFiles: Array<{ path: string }>
    unstagedFiles: Array<{ path: string }>
    gitUser: { name: string; email: string } | null
    repoOwner: string | null
    settings: any
    unpushedCommits: GitCommit[]
    branches: Array<{ name: string; isRemote: boolean; isLocal?: boolean }>
    remotes: Array<{ name: string; pushUrl: string }>
    targetBranch: string
    currentBranch: string
    branchName: 'main' | 'master' | 'custom'
    customBranchName: string
    createGitignore: boolean
    gitignoreTemplate: string
    selectedPatterns: Set<string>
    createInitialCommit: boolean
    initialCommitMessage: string
    remoteUrl: string
    projectName?: string
    projectPath?: string
    refreshGitData: (refreshFileTree?: boolean, options?: RefreshGitOptions) => Promise<void>
    showToast: (
        message: string,
        actionLabel?: string,
        actionTo?: string,
        tone?: 'success' | 'error' | 'info'
    ) => void
    setSelectedCommit: (commit: GitCommit | null) => void
    setLoadingDiff: (loading: boolean) => void
    setCommitDiff: (diff: string) => void
    setShowAuthorMismatch: (show: boolean) => void
    setIsGeneratingCommitMessage: (loading: boolean) => void
    setCommitMessage: (value: string) => void
    setIsCommitting: (loading: boolean) => void
    setIsStackedActionRunning: (loading: boolean) => void
    setIsPushing: (loading: boolean) => void
    setIsFetching: (loading: boolean) => void
    setIsPulling: (loading: boolean) => void
    setLastFetched: (timestamp: number | undefined) => void
    setLastPulled: (timestamp: number | undefined) => void
    setIsSwitchingBranch: (loading: boolean) => void
    setIsInitializing: (loading: boolean) => void
    setIsGitRepo: (value: boolean) => void
    setInitStep: (step: 'config' | 'remote') => void
    setRemoteUrl: (value: string) => void
    setHasRemote: (value: boolean) => void
    setShowInitModal: (value: boolean) => void
    setIsAddingRemote: (value: boolean) => void
    setGitStatusDetails: (
        value: GitStatusDetail[] | ((prev: GitStatusDetail[]) => GitStatusDetail[])
    ) => void
    setGitStatusMap: (
        value: Record<string, FileTreeNode['gitStatus']> | ((prev: Record<string, FileTreeNode['gitStatus']>) => Record<string, FileTreeNode['gitStatus']>)
    ) => void
}

export type ApplyOptimisticDetails = (
    mutate: (prev: GitStatusDetail[]) => GitStatusDetail[]
) => (() => void)
