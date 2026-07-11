import { useEffect, type MutableRefObject } from 'react'
import { getCachedProjectGitSnapshot, setCachedProjectGitSnapshot } from '@/lib/projectViewCache'
import { setCachedProjectGitOverview } from '@/lib/projectGitOverview'
import type { UseProjectGitLifecycleParams } from './types'
import type { GitDataSnapshot } from './gitLifecycleUtils'
import { createEmptyGitStateMap } from './gitLifecycleUtils'

export function useProjectGitCacheLifecycle(
    params: UseProjectGitLifecycleParams,
    gitSensorTokenRef: MutableRefObject<string | null>
): void {
    const {
        decodedPath,
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
        setGitError,
        setLoadingGit,
        setLoadingGitHistory,
        setTargetBranch,
        setCommitPage,
        setUnpushedPage,
        setChangesPage
    } = params

    useEffect(() => {
        if (!decodedPath) return

        const cachedGit = getCachedProjectGitSnapshot(decodedPath)
        gitSensorTokenRef.current = null

        if (cachedGit) {
            setIsGitRepo(typeof cachedGit.isGitRepo === 'boolean' ? cachedGit.isGitRepo : null)
            setGitStatusDetails(Array.isArray(cachedGit.gitStatusDetails) ? cachedGit.gitStatusDetails : [])
            setGitHistory(Array.isArray(cachedGit.gitHistory) ? cachedGit.gitHistory : [])
            setGitHistoryTotalCount(typeof cachedGit.gitHistoryTotalCount === 'number' ? cachedGit.gitHistoryTotalCount : 0)
            setIncomingCommits(Array.isArray(cachedGit.incomingCommits) ? cachedGit.incomingCommits : [])
            setUnpushedCommits(Array.isArray(cachedGit.unpushedCommits) ? cachedGit.unpushedCommits : [])
            setGitUser(cachedGit.gitUser || null)
            setRepoOwner(typeof cachedGit.repoOwner === 'string' ? cachedGit.repoOwner : null)
            setHasRemote(typeof cachedGit.hasRemote === 'boolean' ? cachedGit.hasRemote : null)
            setGitSyncStatus(cachedGit.gitSyncStatus || null)
            setGitStatusMap(cachedGit.gitStatusMap && typeof cachedGit.gitStatusMap === 'object' ? cachedGit.gitStatusMap : {})
            setBranches(Array.isArray(cachedGit.branches) ? cachedGit.branches : [])
            setRemotes(Array.isArray(cachedGit.remotes) ? cachedGit.remotes : [])
            setTags(Array.isArray(cachedGit.tags) ? cachedGit.tags : [])
            setStashes(Array.isArray(cachedGit.stashes) ? cachedGit.stashes : [])
            setGitError(null)
            setLoadingGit(false)
            setLoadingGitHistory(false)
        } else {
            setGitHistory([])
            setGitHistoryTotalCount(0)
            setIncomingCommits([])
            setUnpushedCommits([])
            setGitUser(null)
            setRepoOwner(null)
            setHasRemote(null)
            setGitSyncStatus(null)
            setGitError(null)
            setIsGitRepo(null)
            setGitStatusDetails([])
            setGitStatusMap(createEmptyGitStateMap())
            setBranches([])
            setRemotes([])
            setTags([])
            setStashes([])
            setLoadingGit(false)
            setLoadingGitHistory(false)
        }

        setTargetBranch('')
        setCommitPage(1)
        setUnpushedPage(1)
        setChangesPage(1)
    }, [
        decodedPath,
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
        setGitError,
        setLoadingGit,
        setLoadingGitHistory,
        setTargetBranch,
        setCommitPage,
        setUnpushedPage,
        setChangesPage,
        gitSensorTokenRef
    ])

    useEffect(() => {
        if (!decodedPath || isGitRepo === null) return

        const snapshot: GitDataSnapshot = {
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
            stashes
        }

        setCachedProjectGitSnapshot(decodedPath, snapshot)
        setCachedProjectGitOverview(decodedPath, {
            path: decodedPath,
            isGitRepo,
            changedCount: isGitRepo ? gitStatusDetails.length : 0,
            unpushedCount: isGitRepo ? unpushedCommits.length : 0,
            hasRemote: hasRemote === true
        })
    }, [
        decodedPath,
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
        stashes
    ])
}
