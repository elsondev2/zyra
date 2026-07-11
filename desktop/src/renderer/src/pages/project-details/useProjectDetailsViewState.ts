import { useMemo, useRef, useState } from 'react'
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
} from './types'
import type { CreateFileSystemTarget, FileSystemClipboardItem } from './projectDetailsPageHelpers'
import {
    readStoredProjectActiveTab,
    readStoredProjectGitActivity,
    readStoredProjectGitView,
    resolveBranchState
} from './projectDetailsPageHelpers'

export function useProjectDetailsViewState(decodedPath: string, settings: any) {
    const [project, setProject] = useState<ProjectDetails | null>(null)
    const [fileTree, setFileTree] = useState<FileTreeNode[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [showHidden, setShowHidden] = useState(false)
    const [copiedPath, setCopiedPath] = useState(false)
    const [activeTab, setActiveTab] = useState<'readme' | 'files' | 'git'>(() => (
        readStoredProjectActiveTab(decodedPath) || 'readme'
    ))
    const [showDependenciesModal, setShowDependenciesModal] = useState(false)
    const [showScriptsModal, setShowScriptsModal] = useState(false)
    const [isProjectLive, setIsProjectLive] = useState(false)
    const [activePorts, setActivePorts] = useState<number[]>([])
    const [gitHistory, setGitHistory] = useState<GitCommit[]>([])
    const [gitHistoryTotalCount, setGitHistoryTotalCount] = useState(0)
    const [loadingGit, setLoadingGit] = useState(false)
    const [loadingGitHistory, setLoadingGitHistory] = useState(false)
    const [gitError, setGitError] = useState<string | null>(null)
    const [loadingFiles, setLoadingFiles] = useState(true)
    const [gitView, setGitView] = useState<'changes' | 'history' | 'unpushed' | 'pulls' | 'manage'>(() => (
        readStoredProjectGitView(decodedPath) || 'manage'
    ))
    const [commitPage, setCommitPage] = useState(1)
    const [unpushedPage, setUnpushedPage] = useState(1)
    const [pullsPage, setPullsPage] = useState(1)
    const [changesPage, setChangesPage] = useState(1)
    const HISTORY_CHUNK_SIZE = 80
    const COMMITS_PER_PAGE = 15
    const ITEMS_PER_PAGE = 15
    const [historyLimit, setHistoryLimit] = useState(HISTORY_CHUNK_SIZE)
    const [loadingMoreHistory, setLoadingMoreHistory] = useState(false)
    const [selectedCommit, setSelectedCommit] = useState<GitCommit | null>(null)
    const [commitDiff, setCommitDiff] = useState('')
    const [loadingDiff, setLoadingDiff] = useState(false)
    const [unpushedCommits, setUnpushedCommits] = useState<GitCommit[]>([])
    const [incomingCommits, setIncomingCommits] = useState<GitCommit[]>([])
    const [gitUser, setGitUser] = useState<{ name: string; email: string } | null>(null)
    const [repoOwner, setRepoOwner] = useState<string | null>(null)
    const [gitSyncStatus, setGitSyncStatus] = useState<GitSyncStatus | null>(null)
    const [commitMessage, setCommitMessage] = useState('')
    const [isCommitting, setIsCommitting] = useState(false)
    const [isStackedActionRunning, setIsStackedActionRunning] = useState(false)
    const [isGeneratingCommitMessage, setIsGeneratingCommitMessage] = useState(false)
    const [isPushing, setIsPushing] = useState(false)
    const [isFetching, setIsFetching] = useState(false)
    const [isPulling, setIsPulling] = useState(false)
    const initialGitActivity = useMemo(
        () => readStoredProjectGitActivity(decodedPath),
        [decodedPath]
    )
    const [lastFetched, setLastFetched] = useState<number | undefined>(() => initialGitActivity.lastFetched)
    const [lastPulled, setLastPulled] = useState<number | undefined>(() => initialGitActivity.lastPulled)
    const [toast, setToast] = useState<{
        message: string
        visible: boolean
        actionLabel?: string
        actionTo?: string
        tone?: 'success' | 'error' | 'info'
    } | null>(null)
    const [showAuthorMismatch, setShowAuthorMismatch] = useState(false)
    const [isGitRepo, setIsGitRepo] = useState<boolean | null>(null)
    const [showInitModal, setShowInitModal] = useState(false)
    const [initStep, setInitStep] = useState<'config' | 'remote'>('config')
    const initialBranchState = useMemo(
        () => resolveBranchState(settings.gitInitDefaultBranch),
        [settings.gitInitDefaultBranch]
    )
    const [branchName, setBranchName] = useState<'main' | 'master' | 'custom'>(initialBranchState.branchName)
    const [customBranchName, setCustomBranchName] = useState(initialBranchState.customBranchName)
    const [createGitignore, setCreateGitignore] = useState(settings.gitInitCreateGitignore)
    const [gitignoreTemplate, setGitignoreTemplate] = useState<string>('')
    const [availableTemplates, setAvailableTemplates] = useState<string[]>([])
    const [createInitialCommit, setCreateInitialCommit] = useState(settings.gitInitCreateInitialCommit)
    const [initialCommitMessage, setInitialCommitMessage] = useState('Initial commit')
    const [isInitializing, setIsInitializing] = useState(false)
    const [remoteUrl, setRemoteUrl] = useState('')
    const [isAddingRemote, setIsAddingRemote] = useState(false)
    const [hasRemote, setHasRemote] = useState<boolean | null>(null)
    const [branches, setBranches] = useState<GitBranchSummary[]>([])
    const [remotes, setRemotes] = useState<GitRemoteSummary[]>([])
    const [tags, setTags] = useState<GitTagSummary[]>([])
    const [stashes, setStashes] = useState<GitStashSummary[]>([])
    const [gitStatusDetails, setGitStatusDetails] = useState<GitStatusDetail[]>([])
    const [gitStatusMap, setGitStatusMap] = useState<Record<string, FileTreeNode['gitStatus']>>({})
    const [targetBranch, setTargetBranch] = useState('')
    const [isSwitchingBranch, setIsSwitchingBranch] = useState(false)
    const [availablePatterns, setAvailablePatterns] = useState<any[]>([])
    const [selectedPatterns, setSelectedPatterns] = useState<Set<string>>(new Set())
    const [patternSearch, setPatternSearch] = useState('')
    const historyStatsRequestRef = useRef(0)
    const unpushedStatsRequestRef = useRef(0)
    const gitActivityHydratedPathRef = useRef<string | null>(null)
    const [readmeExpanded, setReadmeExpanded] = useState(false)
    const [readmeNeedsExpand, setReadmeNeedsExpand] = useState(false)
    const readmeContentRef = useRef<HTMLDivElement | null>(null)
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
    const [isExpandingFolders, setIsExpandingFolders] = useState(false)
    const [loadingFolderPaths, setLoadingFolderPaths] = useState<Set<string>>(new Set())
    const [sortBy, setSortBy] = useState<'name' | 'size' | 'type'>('name')
    const [sortAsc, setSortAsc] = useState(true)
    const [fileSearch, setFileSearch] = useState('')
    const [fileClipboardItem, setFileClipboardItem] = useState<FileSystemClipboardItem | null>(null)
    const [renameTarget, setRenameTarget] = useState<FileTreeNode | null>(null)
    const [renameDraft, setRenameDraft] = useState('')
    const [renameExtensionSuffix, setRenameExtensionSuffix] = useState('')
    const [renameErrorMessage, setRenameErrorMessage] = useState<string | null>(null)
    const [createTarget, setCreateTarget] = useState<CreateFileSystemTarget | null>(null)
    const [createDraft, setCreateDraft] = useState('')
    const [createErrorMessage, setCreateErrorMessage] = useState<string | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<FileTreeNode | null>(null)

    return {
        HISTORY_CHUNK_SIZE,
        COMMITS_PER_PAGE,
        ITEMS_PER_PAGE,
        project,
        setProject,
        fileTree,
        setFileTree,
        loading,
        setLoading,
        error,
        setError,
        showHidden,
        setShowHidden,
        copiedPath,
        setCopiedPath,
        activeTab,
        setActiveTab,
        showDependenciesModal,
        setShowDependenciesModal,
        showScriptsModal,
        setShowScriptsModal,
        isProjectLive,
        setIsProjectLive,
        activePorts,
        setActivePorts,
        gitHistory,
        setGitHistory,
        gitHistoryTotalCount,
        setGitHistoryTotalCount,
        loadingGit,
        setLoadingGit,
        loadingGitHistory,
        setLoadingGitHistory,
        gitError,
        setGitError,
        loadingFiles,
        setLoadingFiles,
        gitView,
        setGitView,
        commitPage,
        setCommitPage,
        unpushedPage,
        setUnpushedPage,
        pullsPage,
        setPullsPage,
        changesPage,
        setChangesPage,
        historyLimit,
        setHistoryLimit,
        loadingMoreHistory,
        setLoadingMoreHistory,
        selectedCommit,
        setSelectedCommit,
        commitDiff,
        setCommitDiff,
        loadingDiff,
        setLoadingDiff,
        unpushedCommits,
        setUnpushedCommits,
        incomingCommits,
        setIncomingCommits,
        gitUser,
        setGitUser,
        repoOwner,
        setRepoOwner,
        gitSyncStatus,
        setGitSyncStatus,
        commitMessage,
        setCommitMessage,
        isCommitting,
        setIsCommitting,
        isStackedActionRunning,
        setIsStackedActionRunning,
        isGeneratingCommitMessage,
        setIsGeneratingCommitMessage,
        isPushing,
        setIsPushing,
        isFetching,
        setIsFetching,
        isPulling,
        setIsPulling,
        lastFetched,
        setLastFetched,
        lastPulled,
        setLastPulled,
        toast,
        setToast,
        showAuthorMismatch,
        setShowAuthorMismatch,
        isGitRepo,
        setIsGitRepo,
        showInitModal,
        setShowInitModal,
        initStep,
        setInitStep,
        initialBranchState,
        branchName,
        setBranchName,
        customBranchName,
        setCustomBranchName,
        createGitignore,
        setCreateGitignore,
        gitignoreTemplate,
        setGitignoreTemplate,
        availableTemplates,
        setAvailableTemplates,
        createInitialCommit,
        setCreateInitialCommit,
        initialCommitMessage,
        setInitialCommitMessage,
        isInitializing,
        setIsInitializing,
        remoteUrl,
        setRemoteUrl,
        isAddingRemote,
        setIsAddingRemote,
        hasRemote,
        setHasRemote,
        branches,
        setBranches,
        remotes,
        setRemotes,
        tags,
        setTags,
        stashes,
        setStashes,
        gitStatusDetails,
        setGitStatusDetails,
        gitStatusMap,
        setGitStatusMap,
        targetBranch,
        setTargetBranch,
        isSwitchingBranch,
        setIsSwitchingBranch,
        availablePatterns,
        setAvailablePatterns,
        selectedPatterns,
        setSelectedPatterns,
        patternSearch,
        setPatternSearch,
        historyStatsRequestRef,
        unpushedStatsRequestRef,
        gitActivityHydratedPathRef,
        readmeExpanded,
        setReadmeExpanded,
        readmeNeedsExpand,
        setReadmeNeedsExpand,
        readmeContentRef,
        expandedFolders,
        setExpandedFolders,
        isExpandingFolders,
        setIsExpandingFolders,
        loadingFolderPaths,
        setLoadingFolderPaths,
        sortBy,
        setSortBy,
        sortAsc,
        setSortAsc,
        fileSearch,
        setFileSearch,
        fileClipboardItem,
        setFileClipboardItem,
        renameTarget,
        setRenameTarget,
        renameDraft,
        setRenameDraft,
        renameExtensionSuffix,
        setRenameExtensionSuffix,
        renameErrorMessage,
        setRenameErrorMessage,
        createTarget,
        setCreateTarget,
        createDraft,
        setCreateDraft,
        createErrorMessage,
        setCreateErrorMessage,
        deleteTarget,
        setDeleteTarget
    }
}
