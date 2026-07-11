import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type {
    FileTreeNode,
    GitBranchSummary,
    GitCommit,
    GitRemoteSummary,
    GitSyncStatus,
    GitStatusDetail,
    GitStashSummary,
    GitTagSummary,
    ProjectDetails
} from '../types'

export type GitView = 'changes' | 'history' | 'unpushed' | 'pulls' | 'manage'
export type GitIdentity = { name: string; email: string } | null

export interface UseProjectDataLifecycleParams {
    decodedPath: string
    activeTab: 'readme' | 'files' | 'git'
    gitView: GitView
    project: ProjectDetails | null
    fileTree: FileTreeNode[]
    isGitRepo: boolean | null
    gitStatusDetails: GitStatusDetail[]
    gitHistory: GitCommit[]
    gitHistoryTotalCount: number
    incomingCommits: GitCommit[]
    unpushedCommits: GitCommit[]
    gitUser: GitIdentity
    repoOwner: string | null
    hasRemote: boolean | null
    gitSyncStatus: GitSyncStatus | null
    gitStatusMap: Record<string, FileTreeNode['gitStatus']>
    branches: GitBranchSummary[]
    remotes: GitRemoteSummary[]
    tags: GitTagSummary[]
    stashes: GitStashSummary[]
    historyLimit: number
    autoRefreshGitOnProjectOpen: boolean
    showInitModal: boolean
    gitignoreTemplate: string
    availableTemplates: string[]
    availablePatterns: any[]
    readmeExpanded: boolean
    readmeCollapsedMaxHeight: number
    readmeContentRef: MutableRefObject<HTMLDivElement | null>
    setLoading: Dispatch<SetStateAction<boolean>>
    setError: Dispatch<SetStateAction<string | null>>
    setProject: Dispatch<SetStateAction<ProjectDetails | null>>
    setFileTree: Dispatch<SetStateAction<FileTreeNode[]>>
    setLoadingGit: Dispatch<SetStateAction<boolean>>
    setLoadingGitHistory: Dispatch<SetStateAction<boolean>>
    setGitError: Dispatch<SetStateAction<string | null>>
    setIsGitRepo: Dispatch<SetStateAction<boolean | null>>
    setGitStatusDetails: Dispatch<SetStateAction<GitStatusDetail[]>>
    setGitHistory: Dispatch<SetStateAction<GitCommit[]>>
    setGitHistoryTotalCount: Dispatch<SetStateAction<number>>
    setIncomingCommits: Dispatch<SetStateAction<GitCommit[]>>
    setUnpushedCommits: Dispatch<SetStateAction<GitCommit[]>>
    setGitUser: Dispatch<SetStateAction<GitIdentity>>
    setRepoOwner: Dispatch<SetStateAction<string | null>>
    setHasRemote: Dispatch<SetStateAction<boolean | null>>
    setGitSyncStatus: Dispatch<SetStateAction<GitSyncStatus | null>>
    setGitStatusMap: Dispatch<SetStateAction<Record<string, FileTreeNode['gitStatus']>>>
    setBranches: Dispatch<SetStateAction<GitBranchSummary[]>>
    setRemotes: Dispatch<SetStateAction<GitRemoteSummary[]>>
    setTags: Dispatch<SetStateAction<GitTagSummary[]>>
    setStashes: Dispatch<SetStateAction<GitStashSummary[]>>
    setTargetBranch: Dispatch<SetStateAction<string>>
    setGitView: Dispatch<SetStateAction<GitView>>
    setCommitPage: Dispatch<SetStateAction<number>>
    setUnpushedPage: Dispatch<SetStateAction<number>>
    setChangesPage: Dispatch<SetStateAction<number>>
    setAvailableTemplates: Dispatch<SetStateAction<string[]>>
    setGitignoreTemplate: Dispatch<SetStateAction<string>>
    setAvailablePatterns: Dispatch<SetStateAction<any[]>>
    setSelectedPatterns: Dispatch<SetStateAction<Set<string>>>
    setReadmeExpanded: Dispatch<SetStateAction<boolean>>
    setReadmeNeedsExpand: Dispatch<SetStateAction<boolean>>
    setIsProjectLive: Dispatch<SetStateAction<boolean>>
    setActivePorts: Dispatch<SetStateAction<number[]>>
    setLoadingFiles: Dispatch<SetStateAction<boolean>>
}

export type GitLifecycleDataState = Pick<
    UseProjectDataLifecycleParams,
    | 'gitView'
    | 'isGitRepo'
    | 'gitStatusDetails'
    | 'gitHistory'
    | 'gitHistoryTotalCount'
    | 'incomingCommits'
    | 'unpushedCommits'
    | 'gitUser'
    | 'repoOwner'
    | 'hasRemote'
    | 'gitSyncStatus'
    | 'branches'
    | 'remotes'
    | 'tags'
    | 'stashes'
>

export type RefreshFileTree = (
    options?: { deep?: boolean; targetPath?: string }
) => Promise<FileTreeNode[] | undefined>

export type UseProjectGitLifecycleParams = Pick<
    UseProjectDataLifecycleParams,
    | 'decodedPath'
    | 'activeTab'
    | 'gitView'
    | 'fileTree'
    | 'isGitRepo'
    | 'gitStatusDetails'
    | 'gitHistory'
    | 'gitHistoryTotalCount'
    | 'incomingCommits'
    | 'unpushedCommits'
    | 'gitUser'
    | 'repoOwner'
    | 'hasRemote'
    | 'gitSyncStatus'
    | 'gitStatusMap'
    | 'branches'
    | 'remotes'
    | 'tags'
    | 'stashes'
    | 'historyLimit'
    | 'autoRefreshGitOnProjectOpen'
    | 'setLoadingGit'
    | 'setLoadingGitHistory'
    | 'setGitError'
    | 'setIsGitRepo'
    | 'setGitStatusDetails'
    | 'setGitHistory'
    | 'setGitHistoryTotalCount'
    | 'setIncomingCommits'
    | 'setUnpushedCommits'
    | 'setGitUser'
    | 'setRepoOwner'
    | 'setHasRemote'
    | 'setGitSyncStatus'
    | 'setGitStatusMap'
    | 'setBranches'
    | 'setRemotes'
    | 'setTags'
    | 'setStashes'
    | 'setTargetBranch'
    | 'setGitView'
    | 'setCommitPage'
    | 'setUnpushedPage'
    | 'setChangesPage'
> & {
    refreshFileTree: RefreshFileTree
}
