import {
    normalizeAssistantProjectPathKey,
    sanitizeAssistantProjectPath
} from '@shared/assistant/session-routing'
import { getParentFolderPath } from './projectDetailsPageHelpers'

export function buildProjectDetailsOverlayProps(props: any) {
    return {
        project: props.project,
        showScriptsModal: props.showScriptsModal,
        setShowScriptsModal: props.setShowScriptsModal,
        showDependenciesModal: props.showDependenciesModal,
        setShowDependenciesModal: props.setShowDependenciesModal,
        onDependenciesUpdated: async () => {
            await props.loadProjectDetails()
        },
        onRunScript: props.runScript,
        scriptPredictions: props.scriptPredictions,
        selectedCommit: props.selectedCommit,
        commitDiff: props.commitDiff,
        loadingDiff: props.loadingDiff,
        setSelectedCommit: props.setSelectedCommit,
        setCommitDiff: props.setCommitDiff,
        showAuthorMismatch: props.showAuthorMismatch,
        gitUser: props.gitUser,
        repoOwner: props.repoOwner,
        handleAuthorMismatchConfirm: props.handleAuthorMismatchConfirm,
        setShowAuthorMismatch: props.setShowAuthorMismatch,
        dontShowAuthorWarning: !props.settings.gitWarnOnAuthorMismatch,
        setDontShowAuthorWarning: (value: boolean) => props.updateSettings({ gitWarnOnAuthorMismatch: !value }),
        showInitModal: props.showInitModal,
        setShowInitModal: props.setShowInitModal,
        setInitStep: props.setInitStep,
        initStep: props.initStep,
        branchName: props.branchName,
        setBranchName: props.setBranchName,
        customBranchName: props.customBranchName,
        setCustomBranchName: props.setCustomBranchName,
        createGitignore: props.createGitignore,
        setCreateGitignore: props.setCreateGitignore,
        gitignoreTemplate: props.gitignoreTemplate,
        setGitignoreTemplate: props.setGitignoreTemplate,
        availableTemplates: props.availableTemplates,
        availablePatterns: props.availablePatterns,
        selectedPatterns: props.selectedPatterns,
        setSelectedPatterns: props.setSelectedPatterns,
        patternSearch: props.patternSearch,
        setPatternSearch: props.setPatternSearch,
        createInitialCommit: props.createInitialCommit,
        setCreateInitialCommit: props.setCreateInitialCommit,
        initialCommitMessage: props.initialCommitMessage,
        setInitialCommitMessage: props.setInitialCommitMessage,
        isInitializing: props.isInitializing,
        handleInitGit: props.handleInitGit,
        remoteUrl: props.remoteUrl,
        setRemoteUrl: props.setRemoteUrl,
        isAddingRemote: props.isAddingRemote,
        handleAddRemote: props.handleAddRemote,
        handleSkipRemote: props.handleSkipRemote
    }
}

export function buildProjectDetailsContentProps(props: any) {
    return {
        isCondensedLayout: props.isCondensedLayout,
        projectDetailsLoading: props.projectDetailsLoading,
        themeColor: props.themeColor,
        project: props.project,
        isProjectLive: props.isProjectLive,
        activePorts: props.activePorts,
        formatRelTime: props.formatRelTime,
        onOpenTerminal: () => props.openTerminal({ displayName: props.projectTerminalLabel, id: 'main', category: 'project' }, props.projectRootPath),
        scriptCount: Object.keys(props.project.scripts || {}).length,
        dependencyCount: Object.keys(props.project.dependencies || {}).length + Object.keys(props.project.devDependencies || {}).length,
        handleCopyPath: props.handleCopyPath,
        copiedPath: props.copiedPath,
        handleOpenInExplorer: props.handleOpenInExplorer,
        goBack: props.goBack,
        activeTab: props.activeTab,
        setActiveTab: props.setActiveTab,
        fileTree: props.fileTree,
        loadingGit: props.loadingGit,
        loadingGitHistory: props.loadingGitHistory,
        loadingFiles: props.loadingFiles,
        changedFiles: props.changedFiles,
        stagedFiles: props.stagedFiles,
        unstagedFiles: props.unstagedFiles,
        unpushedCommits: props.unpushedCommits,
        onBrowseFolder: () => {
            const encodedPath = encodeURIComponent(props.projectRootPath)
            props.navigate(`/folder-browse/${encodedPath}`)
        },
        onShowScriptsModal: () => props.setShowScriptsModal(true),
        onShowDependenciesModal: () => props.setShowDependenciesModal(true),
        onOpenWithAssistant: async () => {
            if (!props.project?.path) return
            const snapshot = await window.devscope.assistant.getSnapshot()
            const targetProjectPath = sanitizeAssistantProjectPath(props.project.path)
            const targetProjectPathKey = normalizeAssistantProjectPathKey(targetProjectPath)
            const matchingSession = snapshot.sessions.find((session) => {
                if (session.archived) return false
                return normalizeAssistantProjectPathKey(session.projectPath) === targetProjectPathKey
            })

            if (matchingSession) {
                const selectResult = await window.devscope.assistant.selectSession(matchingSession.id)
                if (!selectResult?.success) return
            } else {
                const createResult = await window.devscope.assistant.createSession({
                    mode: 'work',
                    projectPath: targetProjectPath || props.project.path
                })
                if (!createResult?.success) return
            }

            props.navigate('/assistant')
        },
        loadProjectDetails: async () => {
            await props.loadProjectDetails()
        },
        refreshFileTree: props.refreshFileTree,
        onToggleAllFolders: props.handleToggleAllFolders,
        readmeContentRef: props.readmeContentRef,
        readmeExpanded: props.readmeExpanded,
        readmeNeedsExpand: props.readmeNeedsExpand,
        setReadmeExpanded: props.setReadmeExpanded,
        fileSearch: props.fileSearch,
        setFileSearch: props.setFileSearch,
        setIsExpandingFolders: props.setIsExpandingFolders,
        expandedFolders: props.expandedFolders,
        setExpandedFolders: props.setExpandedFolders,
        loadingFolderPaths: props.loadingFolderPaths,
        allFolderPathsSet: props.allFolderPathsSet,
        isExpandingFolders: props.isExpandingFolders,
        showHidden: props.showHidden,
        setShowHidden: props.setShowHidden,
        sortBy: props.sortBy,
        setSortBy: props.setSortBy,
        sortAsc: props.sortAsc,
        setSortAsc: props.setSortAsc,
        visibleFileList: props.visibleFileList,
        openPreview: props.openPreview,
        onShowToast: (message: string, tone: 'info' | 'error') => props.showToast(message, undefined, undefined, tone),
        onFileTreeOpen: props.handleFileTreeOpen,
        onToggleFolder: props.handleToggleFolder,
        onFileTreeOpenWith: props.handleFileTreeOpenWith,
        onFileTreeOpenInExplorer: props.handleFileTreeOpenInExplorer,
        onFileTreeCopyPath: props.handleFileTreeCopyPath,
        onFileTreeCopy: props.handleFileTreeCopy,
        onFileTreeRename: props.handleFileTreeRename,
        onFileTreeDelete: props.handleFileTreeDelete,
        onFileTreePaste: props.handleFileTreePaste,
        onFileTreeMove: props.handleFileTreeMove,
        onFileTreeCreateFile: props.handleFileTreeCreateFile,
        onFileTreeCreateFolder: props.handleFileTreeCreateFolder,
        hasFileClipboardItem: Boolean(props.fileClipboardItem),
        gitUser: props.gitUser,
        repoOwner: props.repoOwner,
        gitError: props.gitError,
        gitView: props.gitView,
        setGitView: props.setGitView,
        refreshGitData: props.refreshGitData,
        isGitRepo: props.isGitRepo,
        setShowInitModal: props.setShowInitModal,
        currentBranch: props.currentBranch,
        targetBranch: props.targetBranch,
        setTargetBranch: props.setTargetBranch,
        branches: props.branches,
        isSwitchingBranch: props.isSwitchingBranch,
        handleSwitchBranch: props.handleSwitchBranch,
        commitMessage: props.commitMessage,
        setCommitMessage: props.setCommitMessage,
        handleGenerateCommitMessage: props.handleGenerateCommitMessage,
        isGeneratingCommitMessage: props.isGeneratingCommitMessage,
        isCommitting: props.isCommitting,
        isStackedActionRunning: props.isStackedActionRunning,
        settings: props.settings,
        handleCommit: props.handleCommit,
        handleCommitPushAndCreatePullRequest: props.handleCommitPushAndCreatePullRequest,
        handleDangerouslyStageCommitPushAndCreatePullRequest: props.handleDangerouslyStageCommitPushAndCreatePullRequest,
        handleStageFile: props.handleStageFile,
        handleUnstageFile: props.handleUnstageFile,
        handleStageAll: props.handleStageAll,
        handleUnstageAll: props.handleUnstageAll,
        handleDiscardUnstagedFile: props.handleDiscardUnstagedFile,
        handleDiscardUnstagedAll: props.handleDiscardUnstagedAll,
        ensureStatsForPaths: props.ensureWorkingChangeStats,
        hasRemote: props.hasRemote,
        gitSyncStatus: props.gitSyncStatus,
        incomingCommits: props.incomingCommits,
        setInitStep: props.setInitStep,
        handleFetch: props.handleFetch,
        handlePush: props.handlePush,
        handlePull: props.handlePull,
        isPushing: props.isPushing,
        isFetching: props.isFetching,
        isPulling: props.isPulling,
        lastFetched: props.lastFetched,
        lastPulled: props.lastPulled,
        gitHistory: props.gitHistory,
        gitHistoryTotalCount: props.gitHistoryTotalCount,
        historyHasMore: props.historyHasMore,
        loadingMoreHistory: props.loadingMoreHistory,
        loadMoreGitHistory: props.loadMoreGitHistory,
        remotes: props.remotes,
        tags: props.tags,
        stashes: props.stashes,
        decodedPath: props.decodedPath,
        changesPage: props.changesPage,
        setChangesPage: props.setChangesPage,
        ITEMS_PER_PAGE: props.ITEMS_PER_PAGE,
        handleCommitClick: props.handleCommitClick,
        unpushedPage: props.unpushedPage,
        setUnpushedPage: props.setUnpushedPage,
        pullsPage: props.pullsPage,
        setPullsPage: props.setPullsPage,
        COMMITS_PER_PAGE: props.COMMITS_PER_PAGE,
        commitPage: props.commitPage,
        setCommitPage: props.setCommitPage,
        scriptPredictions: props.scriptPredictions,
        scriptIntentContext: props.scriptIntentContext,
        runScript: props.runScript,
        setShowDependenciesModal: props.setShowDependenciesModal,
        showToast: props.showToast
    }
}

export function buildProjectDetailsTransientUiProps(props: any) {
    return {
        projectPath: props.project.path,
        pendingScriptRun: props.pendingScriptRun,
        scriptPortInput: props.scriptPortInput,
        setScriptPortInput: props.setScriptPortInput,
        setScriptRunError: props.setScriptRunError,
        scriptExposeNetwork: props.scriptExposeNetwork,
        setScriptExposeNetwork: props.setScriptExposeNetwork,
        scriptAdvancedOpen: props.scriptAdvancedOpen,
        setScriptAdvancedOpen: props.setScriptAdvancedOpen,
        scriptExtraArgsInput: props.scriptExtraArgsInput,
        setScriptExtraArgsInput: props.setScriptExtraArgsInput,
        scriptEnvInput: props.scriptEnvInput,
        setScriptEnvInput: props.setScriptEnvInput,
        scriptRunError: props.scriptRunError,
        scriptCommandPreview: props.scriptCommandPreview,
        scriptRunner: props.scriptRunner,
        closeScriptRunModal: props.closeScriptRunModal,
        handleConfirmScriptRun: props.handleConfirmScriptRun,
        previewFile: props.previewFile,
        previewTabs: props.previewTabs,
        activePreviewTabId: props.activePreviewTabId,
        previewMediaItems: props.previewMediaItems,
        previewContent: props.previewContent,
        loadingPreview: props.loadingPreview,
        previewTruncated: props.previewTruncated,
        previewSize: props.previewSize,
        previewBytes: props.previewBytes,
        previewModifiedAt: props.previewModifiedAt,
        openPreview: props.openPreview,
        openPreviewInNewTab: props.openPreviewInNewTab,
        setActivePreviewTab: props.setActivePreviewTab,
        closePreviewTab: props.closePreviewTab,
        reorderPreviewTabs: props.reorderPreviewTabs,
        onPreviewSaved: async () => {
            await Promise.all([
                props.refreshVisibleFileTree(getParentFolderPath(props.previewFile?.path || '') || undefined),
                props.refreshGitData()
            ])
        },
        closePreview: props.closePreview,
        onShowToast: (message: string, tone: 'info' | 'error') => props.showToast(message, undefined, undefined, tone),
        toast: props.toast,
        navigate: props.navigate,
        setToast: props.setToast
    }
}

export function buildProjectDetailsFileSystemModalProps(props: any) {
    return {
        createTarget: props.createTarget,
        createErrorMessage: props.createErrorMessage,
        submitCreateTarget: props.submitCreateTarget,
        setCreateTarget: props.setCreateTarget,
        createDraft: props.createDraft,
        setCreateDraft: props.setCreateDraft,
        setCreateErrorMessage: props.setCreateErrorMessage,
        renameTarget: props.renameTarget,
        renameDraft: props.renameDraft,
        setRenameDraft: props.setRenameDraft,
        renameErrorMessage: props.renameErrorMessage,
        submitRenameTarget: props.submitRenameTarget,
        setRenameTarget: props.setRenameTarget,
        setRenameExtensionSuffix: props.setRenameExtensionSuffix,
        renameExtensionSuffix: props.renameExtensionSuffix,
        setRenameErrorMessage: props.setRenameErrorMessage,
        deleteTarget: props.deleteTarget,
        confirmDeleteTarget: props.confirmDeleteTarget,
        setDeleteTarget: props.setDeleteTarget
    }
}
