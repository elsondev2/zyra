import { useEffect, useMemo } from 'react'
import { useGitignoreTemplateLifecycle } from './projectDataLifecycle/useGitignoreTemplateLifecycle'
import { useProjectDetailsLoader } from './projectDataLifecycle/useProjectDetailsLoader'
import { useProjectFileTreeLifecycle } from './projectDataLifecycle/useProjectFileTreeLifecycle'
import { useProjectGitLifecycle } from './projectDataLifecycle/useProjectGitLifecycle'
import { useProjectLiveStatusLifecycle } from './projectDataLifecycle/useProjectLiveStatusLifecycle'
import { useReadmeOverflowLifecycle } from './projectDataLifecycle/useReadmeOverflowLifecycle'
import type { UseProjectDataLifecycleParams } from './projectDataLifecycle/types'

export function useProjectDataLifecycle(params: UseProjectDataLifecycleParams) {
    const {
        decodedPath,
        activeTab,
        gitView,
        project,
        fileTree,
        isGitRepo,
        gitStatusDetails,
        gitHistory,
        gitHistoryTotalCount,
        incomingCommits,
        unpushedCommits,
        gitUser,
        repoOwner,
        hasRemote,
        gitSyncStatus,
        gitStatusMap,
        branches,
        remotes,
        tags,
        stashes,
        historyLimit,
        autoRefreshGitOnProjectOpen,
        showInitModal,
        gitignoreTemplate,
        availableTemplates,
        availablePatterns,
        readmeExpanded,
        readmeCollapsedMaxHeight,
        readmeContentRef,
        setLoading,
        setError,
        setProject,
        setFileTree,
        setLoadingGit,
        setLoadingGitHistory,
        setGitError,
        setIsGitRepo,
        setGitStatusDetails,
        setGitHistory,
        setGitHistoryTotalCount,
        setIncomingCommits,
        setUnpushedCommits,
        setGitUser,
        setRepoOwner,
        setHasRemote,
        setGitSyncStatus,
        setGitStatusMap,
        setBranches,
        setRemotes,
        setTags,
        setStashes,
        setTargetBranch,
        setGitView,
        setCommitPage,
        setUnpushedPage,
        setChangesPage,
        setAvailableTemplates,
        setGitignoreTemplate,
        setAvailablePatterns,
        setSelectedPatterns,
        setReadmeExpanded,
        setReadmeNeedsExpand,
        setIsProjectLive,
        setActivePorts,
        setLoadingFiles
    } = params

    useReadmeOverflowLifecycle({
        project,
        activeTab,
        readmeExpanded,
        readmeCollapsedMaxHeight,
        readmeContentRef,
        setReadmeExpanded,
        setReadmeNeedsExpand
    })

    const { loadProjectDetails } = useProjectDetailsLoader({
        decodedPath,
        setLoading,
        setError,
        setProject,
        setFileTree,
        setLoadingFiles
    })

    const { refreshFileTree } = useProjectFileTreeLifecycle({
        decodedPath,
        fileTree,
        setFileTree,
        setLoadingFiles
    })

    const gitLifecycleParams = useMemo(() => ({
        decodedPath,
        activeTab,
        gitView,
        fileTree,
        isGitRepo,
        gitStatusDetails,
        gitHistory,
        gitHistoryTotalCount,
        incomingCommits,
        unpushedCommits,
        gitUser,
        repoOwner,
        hasRemote,
        gitSyncStatus,
        gitStatusMap,
        branches,
        remotes,
        tags,
        stashes,
        historyLimit,
        autoRefreshGitOnProjectOpen,
        refreshFileTree,
        setLoadingGit,
        setLoadingGitHistory,
        setGitError,
        setIsGitRepo,
        setGitStatusDetails,
        setGitHistory,
        setGitHistoryTotalCount,
        setIncomingCommits,
        setUnpushedCommits,
        setGitUser,
        setRepoOwner,
        setHasRemote,
        setGitSyncStatus,
        setGitStatusMap,
        setBranches,
        setRemotes,
        setTags,
        setStashes,
        setTargetBranch,
        setGitView,
        setCommitPage,
        setUnpushedPage,
        setChangesPage
    }), [
        decodedPath,
        activeTab,
        gitView,
        fileTree,
        isGitRepo,
        gitStatusDetails,
        gitHistory,
        gitHistoryTotalCount,
        incomingCommits,
        unpushedCommits,
        gitUser,
        repoOwner,
        hasRemote,
        gitSyncStatus,
        gitStatusMap,
        branches,
        remotes,
        tags,
        stashes,
        historyLimit,
        autoRefreshGitOnProjectOpen,
        refreshFileTree,
        setLoadingGit,
        setLoadingGitHistory,
        setGitError,
        setIsGitRepo,
        setGitStatusDetails,
        setGitHistory,
        setGitHistoryTotalCount,
        setIncomingCommits,
        setUnpushedCommits,
        setGitUser,
        setRepoOwner,
        setHasRemote,
        setGitSyncStatus,
        setGitStatusMap,
        setBranches,
        setRemotes,
        setTags,
        setStashes,
        setTargetBranch,
        setGitView,
        setCommitPage,
        setUnpushedPage,
        setChangesPage
    ])
    const { refreshGitData } = useProjectGitLifecycle(gitLifecycleParams)

    useEffect(() => {
        void loadProjectDetails()
    }, [loadProjectDetails])

    useGitignoreTemplateLifecycle({
        showInitModal,
        availableTemplates,
        gitignoreTemplate,
        availablePatterns,
        project,
        setAvailableTemplates,
        setGitignoreTemplate,
        setAvailablePatterns,
        setSelectedPatterns
    })

    useProjectLiveStatusLifecycle({
        projectPath: project?.path,
        setIsProjectLive,
        setActivePorts
    })

    return {
        loadProjectDetails,
        refreshGitData,
        refreshFileTree
    }
}
