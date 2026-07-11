export type GitFileStatus = 'modified' | 'untracked' | 'added' | 'deleted' | 'renamed' | 'ignored' | 'unknown'

export interface GitStatusMap {
    [relativePath: string]: GitFileStatus
}

export interface GitStatusDetail {
    path: string
    previousPath?: string
    status: GitFileStatus
    code: string
    staged: boolean
    unstaged: boolean
    additions: number
    deletions: number
    stagedAdditions: number
    stagedDeletions: number
    unstagedAdditions: number
    unstagedDeletions: number
    statsLoaded?: boolean
}

export interface GitStatusEntryStats {
    path: string
    additions: number
    deletions: number
    stagedAdditions: number
    stagedDeletions: number
    unstagedAdditions: number
    unstagedDeletions: number
    statsLoaded: boolean
}

export interface ProjectGitOverview {
    path: string
    isGitRepo: boolean
    changedCount: number
    unpushedCount: number
    hasRemote: boolean
    error?: string
}

export interface GitBranchSummary {
    name: string
    current: boolean
    commit: string
    label: string
    isRemote: boolean
    isLocal?: boolean
}

export interface GitRemoteSummary {
    name: string
    fetchUrl: string
    pushUrl: string
}

export interface GitSyncStatus {
    currentBranch: string
    upstreamBranch: string | null
    headHash: string | null
    upstreamHeadHash: string | null
    hasRemote: boolean
    ahead: number
    behind: number
    workingTreeChanged: boolean
    workingTreeChangeCount: number
    statusToken: string
    detached: boolean
}

export interface GitTagSummary {
    name: string
    commit?: string
}

export interface CheckoutBranchOptions {
    autoStash?: boolean
    autoCleanupLock?: boolean
}

export interface CheckoutBranchResult {
    stashed: boolean
    cleanedLock?: boolean
    stashRef?: string
    stashMessage?: string
}

export interface GitCommit {
    hash: string
    shortHash: string
    parents: string[]
    author: string
    date: string
    message: string
    additions: number
    deletions: number
    filesChanged: number
    statsLoaded?: boolean
}

export interface GitHistoryResult {
    commits: GitCommit[]
}

export interface GitHistoryCountResult {
    totalCount: number
}

export interface GitignorePattern {
    id: string
    label: string
    description: string
    category: 'dependencies' | 'build' | 'environment' | 'ide' | 'os' | 'logs' | 'cache' | 'testing'
    patterns: string[]
}

export interface RepoContext {
    repoRoot: string
    projectRelativeToRepo: string
}

export interface CompactPatchResult {
    text: string
    omittedFiles: string[]
    totalFiles: number
    includedFiles: number
    wasTruncated: boolean
}
