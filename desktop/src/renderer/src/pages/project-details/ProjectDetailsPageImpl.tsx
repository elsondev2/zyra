import { useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTerminal } from '@/App'
import { useFilePreview } from '@/components/ui/FilePreviewModal'
import { useSettings } from '@/lib/settings'
import { isFileTreeFullyLoaded } from './fileTreeUtils'
import { buildProjectDetailsPageViewProps } from './buildProjectDetailsPageViewProps'
import { createProjectGitActions } from './gitActions'
import { ProjectDetailsPageView } from './ProjectDetailsPageView'
import { PREVIEWABLE_EXTENSIONS, PREVIEWABLE_FILE_NAMES, README_COLLAPSED_MAX_HEIGHT } from './projectDetailsPageHelpers'
import { useProjectDataLifecycle } from './useProjectDataLifecycle'
import { useProjectDetailsChromeActions } from './useProjectDetailsChromeActions'
import { useProjectDetailsPersistence } from './useProjectDetailsPersistence'
import { useProjectDetailsViewState } from './useProjectDetailsViewState'
import { useProjectFileTreeActions } from './useProjectFileTreeActions'
import { useProjectFileView } from './useProjectFileView'
import { useProjectGitStats } from './useProjectGitStats'
import { useScriptRunModal } from './useScriptRunModal'

export default function ProjectDetailsPage() {
    const { projectPath } = useParams<{ projectPath: string }>()
    const decodedPath = projectPath ? decodeURIComponent(projectPath) : ''
    const navigate = useNavigate()
    const { openTerminal } = useTerminal()
    const { settings, updateSettings } = useSettings()
    const state = useProjectDetailsViewState(decodedPath, settings)
    const preview = useFilePreview()

    const derived = {
        decodedPath,
        projectRootPath: useMemo(
            () => String(decodedPath || state.project?.path || '').trim(),
            [decodedPath, state.project?.path]
        ),
        projectTerminalLabel: useMemo(
            () => String(state.project?.displayName || state.project?.name || String(decodedPath || state.project?.path || '').trim().split(/[\\/]/).pop() || 'Project'),
            [decodedPath, state.project?.displayName, state.project?.name, state.project?.path]
        ),
        currentBranch: useMemo(
            () => state.branches.find((branch) => branch.current)?.name || '',
            [state.branches]
        )
    }

    const scriptModal = useScriptRunModal({
        project: state.project,
        defaultShell: settings.defaultShell,
        packageRuntimePreference: settings.packageRuntimePreference,
        openTerminal
    })

    const chrome = useProjectDetailsChromeActions({
        decodedPath,
        navigate,
        projectPath: state.project?.path,
        projectRootPath: derived.projectRootPath,
        toast: state.toast,
        setToast: state.setToast,
        setCopiedPath: state.setCopiedPath
    })

    useProjectDetailsPersistence({
        decodedPath,
        activeTab: state.activeTab,
        setActiveTab: state.setActiveTab,
        gitView: state.gitView,
        setGitView: state.setGitView,
        lastFetched: state.lastFetched,
        setLastFetched: state.setLastFetched,
        lastPulled: state.lastPulled,
        setLastPulled: state.setLastPulled,
        setPullsPage: state.setPullsPage,
        historyChunkSize: state.HISTORY_CHUNK_SIZE,
        setHistoryLimit: state.setHistoryLimit,
        setLoadingMoreHistory: state.setLoadingMoreHistory,
        incomingCommitCount: state.incomingCommits.length,
        itemsPerPage: state.ITEMS_PER_PAGE,
        gitActivityHydratedPathRef: state.gitActivityHydratedPathRef,
        showInitModal: state.showInitModal,
        settings,
        setBranchName: state.setBranchName,
        setCustomBranchName: state.setCustomBranchName,
        setCreateGitignore: state.setCreateGitignore,
        setCreateInitialCommit: state.setCreateInitialCommit
    })

    const gitLifecycle = useProjectDataLifecycle({
        decodedPath,
        activeTab: state.activeTab,
        gitView: state.gitView,
        project: state.project,
        fileTree: state.fileTree,
        isGitRepo: state.isGitRepo,
        gitStatusDetails: state.gitStatusDetails,
        gitHistory: state.gitHistory,
        gitHistoryTotalCount: state.gitHistoryTotalCount,
        incomingCommits: state.incomingCommits,
        unpushedCommits: state.unpushedCommits,
        gitUser: state.gitUser,
        repoOwner: state.repoOwner,
        hasRemote: state.hasRemote,
        gitSyncStatus: state.gitSyncStatus,
        gitStatusMap: state.gitStatusMap,
        branches: state.branches,
        remotes: state.remotes,
        tags: state.tags,
        stashes: state.stashes,
        historyLimit: state.historyLimit,
        autoRefreshGitOnProjectOpen: settings.gitAutoRefreshOnProjectOpen,
        showInitModal: state.showInitModal,
        gitignoreTemplate: state.gitignoreTemplate,
        availableTemplates: state.availableTemplates,
        availablePatterns: state.availablePatterns,
        readmeExpanded: state.readmeExpanded,
        readmeCollapsedMaxHeight: README_COLLAPSED_MAX_HEIGHT,
        readmeContentRef: state.readmeContentRef,
        setLoading: state.setLoading,
        setError: state.setError,
        setProject: state.setProject,
        setFileTree: state.setFileTree,
        setLoadingGit: state.setLoadingGit,
        setLoadingGitHistory: state.setLoadingGitHistory,
        setGitError: state.setGitError,
        setIsGitRepo: state.setIsGitRepo,
        setGitStatusDetails: state.setGitStatusDetails,
        setGitHistory: state.setGitHistory,
        setGitHistoryTotalCount: state.setGitHistoryTotalCount,
        setIncomingCommits: state.setIncomingCommits,
        setUnpushedCommits: state.setUnpushedCommits,
        setGitUser: state.setGitUser,
        setRepoOwner: state.setRepoOwner,
        setHasRemote: state.setHasRemote,
        setGitSyncStatus: state.setGitSyncStatus,
        setGitStatusMap: state.setGitStatusMap,
        setBranches: state.setBranches,
        setRemotes: state.setRemotes,
        setTags: state.setTags,
        setStashes: state.setStashes,
        setTargetBranch: state.setTargetBranch,
        setGitView: state.setGitView,
        setCommitPage: state.setCommitPage,
        setUnpushedPage: state.setUnpushedPage,
        setChangesPage: state.setChangesPage,
        setAvailableTemplates: state.setAvailableTemplates,
        setGitignoreTemplate: state.setGitignoreTemplate,
        setAvailablePatterns: state.setAvailablePatterns,
        setSelectedPatterns: state.setSelectedPatterns,
        setReadmeExpanded: state.setReadmeExpanded,
        setReadmeNeedsExpand: state.setReadmeNeedsExpand,
        setIsProjectLive: state.setIsProjectLive,
        setActivePorts: state.setActivePorts,
        setLoadingFiles: state.setLoadingFiles
    })

    useEffect(() => {
        state.setTargetBranch(derived.currentBranch)
    }, [derived.currentBranch, state.setTargetBranch])

    const fileView = useProjectFileView({
        projectRootPath: derived.projectRootPath,
        fileTree: state.fileTree,
        gitStatusMap: state.gitStatusMap,
        showHidden: state.showHidden,
        sortBy: state.sortBy,
        sortAsc: state.sortAsc,
        fileSearch: state.fileSearch,
        expandedFolders: state.expandedFolders,
        previewableExtensions: PREVIEWABLE_EXTENSIONS,
        previewableFileNames: PREVIEWABLE_FILE_NAMES
    })

    const gitStats = useProjectGitStats({
        activeTab: state.activeTab,
        gitView: state.gitView,
        decodedPath,
        gitHistory: state.gitHistory,
        gitHistoryTotalCount: state.gitHistoryTotalCount,
        commitPage: state.commitPage,
        COMMITS_PER_PAGE: state.COMMITS_PER_PAGE,
        setGitHistory: state.setGitHistory,
        unpushedCommits: state.unpushedCommits,
        unpushedPage: state.unpushedPage,
        ITEMS_PER_PAGE: state.ITEMS_PER_PAGE,
        setUnpushedCommits: state.setUnpushedCommits,
        historyStatsRequestRef: state.historyStatsRequestRef,
        unpushedStatsRequestRef: state.unpushedStatsRequestRef,
        historyLimit: state.historyLimit,
        HISTORY_CHUNK_SIZE: state.HISTORY_CHUNK_SIZE,
        loadingMoreHistory: state.loadingMoreHistory,
        setLoadingMoreHistory: state.setLoadingMoreHistory,
        setHistoryLimit: state.setHistoryLimit,
        gitStatusDetails: state.gitStatusDetails,
        setGitStatusDetails: state.setGitStatusDetails
    })

    const fileTreeFullyLoaded = useMemo(
        () => isFileTreeFullyLoaded(state.fileTree),
        [state.fileTree]
    )

    const fileTreeActions = useProjectFileTreeActions({
        activeTab: state.activeTab,
        loadingFiles: state.loadingFiles,
        projectRootPath: derived.projectRootPath,
        fileSearch: state.fileSearch,
        fileTreeFullyLoaded,
        refreshFileTree: gitLifecycle.refreshFileTree,
        expandedFolders: state.expandedFolders,
        setExpandedFolders: state.setExpandedFolders,
        setLoadingFolderPaths: state.setLoadingFolderPaths,
        setIsExpandingFolders: state.setIsExpandingFolders,
        fileTree: state.fileTree,
        setFileTree: state.setFileTree,
        openFile: preview.openFile,
        openPreview: preview.openPreview,
        showToast: chrome.showToast,
        fileClipboardItem: state.fileClipboardItem,
        setFileClipboardItem: state.setFileClipboardItem,
        setRenameTarget: state.setRenameTarget,
        setRenameDraft: state.setRenameDraft,
        setRenameExtensionSuffix: state.setRenameExtensionSuffix,
        setRenameErrorMessage: state.setRenameErrorMessage,
        setCreateTarget: state.setCreateTarget,
        setCreateDraft: state.setCreateDraft,
        setCreateErrorMessage: state.setCreateErrorMessage,
        setDeleteTarget: state.setDeleteTarget,
        createTarget: state.createTarget,
        createDraft: state.createDraft,
        setCreateDraftState: state.setCreateDraft,
        renameTarget: state.renameTarget,
        renameDraft: state.renameDraft,
        renameExtensionSuffix: state.renameExtensionSuffix,
        deleteTarget: state.deleteTarget
    })

    const gitActions = createProjectGitActions({
        decodedPath,
        commitMessage: state.commitMessage,
        changedFiles: fileView.changedFiles,
        stagedFiles: gitStats.stagedFiles,
        unstagedFiles: gitStats.unstagedFiles,
        gitUser: state.gitUser,
        repoOwner: state.repoOwner,
        settings,
        unpushedCommits: state.unpushedCommits,
        branches: state.branches,
        remotes: state.remotes,
        targetBranch: state.targetBranch,
        currentBranch: derived.currentBranch,
        branchName: state.branchName,
        customBranchName: state.customBranchName,
        createGitignore: state.createGitignore,
        gitignoreTemplate: state.gitignoreTemplate,
        selectedPatterns: state.selectedPatterns,
        createInitialCommit: state.createInitialCommit,
        initialCommitMessage: state.initialCommitMessage,
        remoteUrl: state.remoteUrl,
        projectName: state.project?.displayName || state.project?.name,
        projectPath: state.project?.path,
        refreshGitData: gitLifecycle.refreshGitData,
        showToast: chrome.showToast,
        setSelectedCommit: state.setSelectedCommit,
        setLoadingDiff: state.setLoadingDiff,
        setCommitDiff: state.setCommitDiff,
        setShowAuthorMismatch: state.setShowAuthorMismatch,
        setIsGeneratingCommitMessage: state.setIsGeneratingCommitMessage,
        setCommitMessage: state.setCommitMessage,
        setIsCommitting: state.setIsCommitting,
        setIsStackedActionRunning: state.setIsStackedActionRunning,
        setIsPushing: state.setIsPushing,
        setIsFetching: state.setIsFetching,
        setIsPulling: state.setIsPulling,
        setLastFetched: state.setLastFetched,
        setLastPulled: state.setLastPulled,
        setIsSwitchingBranch: state.setIsSwitchingBranch,
        setIsInitializing: state.setIsInitializing,
        setIsGitRepo: state.setIsGitRepo,
        setInitStep: state.setInitStep,
        setRemoteUrl: state.setRemoteUrl,
        setHasRemote: state.setHasRemote,
        setShowInitModal: state.setShowInitModal,
        setIsAddingRemote: state.setIsAddingRemote,
        setGitStatusDetails: state.setGitStatusDetails,
        setGitStatusMap: state.setGitStatusMap
    })

    const viewProps = buildProjectDetailsPageViewProps({
        navigate,
        settings,
        updateSettings,
        openTerminal,
        state,
        preview,
        scriptModal,
        chrome,
        gitLifecycle,
        gitStats,
        gitActions,
        fileView,
        fileTreeActions,
        derived
    })

    return <ProjectDetailsPageView {...viewProps} />
}
