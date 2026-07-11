import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'
import { unstable_batchedUpdates } from 'react-dom'
import { getCachedProjectGitSnapshot } from '@/lib/projectViewCache'
import { isFileTreeFullyLoaded } from '../fileTreeUtils'
import type { FileTreeNode, GitStatusDetail } from '../types'
import type { GitLifecycleDataState, UseProjectGitLifecycleParams } from './types'
import {
    createEmptyGitStateMap,
    hasFocusedGitDataForView,
    hasVisibleGitData,
    INCOMING_COMMITS_LIMIT,
    mergeCommitStats,
    mergeGitStatusDetailStats,
    resolveRepoOwnerFromRemotes,
    type GitRefreshMode,
    yieldToBrowserPaint
} from './gitLifecycleUtils'
import {
    buildGitDataState,
    buildGitDataStateFromSnapshot,
    collapseQueuedGitRefreshRequests,
    type GitRefreshRequest
} from './useProjectGitRefresh.helpers'

export function useProjectGitRefresh(
    params: UseProjectGitLifecycleParams,
    refs: {
        refreshGitForegroundRequestRef: MutableRefObject<number>
        refreshGitBackgroundRequestRef: MutableRefObject<number>
        gitStatusDetailsRef: MutableRefObject<GitStatusDetail[]>
        gitSensorTokenRef: MutableRefObject<string | null>
    }
) {
    const {
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
        branches,
        remotes,
        tags,
        stashes,
        historyLimit,
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
        setStashes
    } = params
    const {
        refreshGitForegroundRequestRef,
        refreshGitBackgroundRequestRef,
        gitStatusDetailsRef,
        gitSensorTokenRef
    } = refs
    const refreshQueueRef = useRef<GitRefreshRequest[]>([])
    const refreshDrainPromiseRef = useRef<Promise<void> | null>(null)
    const activePathRef = useRef(decodedPath)

    useEffect(() => {
        activePathRef.current = decodedPath
        refreshQueueRef.current = []
        refreshDrainPromiseRef.current = null
    }, [decodedPath])

    const executeRefresh = useCallback(async (request: GitRefreshRequest) => {
        if (!decodedPath) return

        const refreshPath = decodedPath
        const { refreshFilesToo, quiet, mode } = request
        const visibleRequestId = quiet ? refreshGitForegroundRequestRef.current : ++refreshGitForegroundRequestRef.current
        const backgroundRequestId = quiet ? ++refreshGitBackgroundRequestRef.current : refreshGitBackgroundRequestRef.current
        const isStaleRefresh = () => quiet
            ? (
                refreshPath !== activePathRef.current
                ||
                backgroundRequestId !== refreshGitBackgroundRequestRef.current
                || visibleRequestId !== refreshGitForegroundRequestRef.current
            )
            : refreshPath !== activePathRef.current || visibleRequestId !== refreshGitForegroundRequestRef.current
        const cachedGitSnapshot = getCachedProjectGitSnapshot(refreshPath)
        const currentGitDataState = buildGitDataState(params)
        const cachedGitDataState = cachedGitSnapshot
            ? buildGitDataStateFromSnapshot(gitView, cachedGitSnapshot)
            : null
        const hasVisibleFocusedData = hasFocusedGitDataForView(currentGitDataState)
        const hasWarmFocusedData = cachedGitDataState ? hasFocusedGitDataForView(cachedGitDataState) : false
        const hasWarmVisibleData = cachedGitDataState ? hasVisibleGitData(cachedGitDataState) : false
        const hasWarmGitData = hasVisibleGitData(currentGitDataState)
            || (activeTab === 'git' ? hasWarmFocusedData : hasWarmVisibleData)
        const shouldShowForegroundLoading = !quiet && !(hasVisibleFocusedData || hasWarmGitData)
        const shouldUseHistoryLoading = !quiet && activeTab === 'git' && gitView === 'history'

        if (shouldUseHistoryLoading) {
            setLoadingGitHistory(true)
        } else if (shouldShowForegroundLoading) {
            setLoadingGit(true)
        }
        if (shouldShowForegroundLoading || shouldUseHistoryLoading) {
            await yieldToBrowserPaint()
        }

        try {
            if (refreshFilesToo) {
                await refreshFileTree({
                    deep: isFileTreeFullyLoaded(fileTree)
                })
            }

            const repoResult = await window.devscope.checkIsGitRepo(refreshPath)
            if (!repoResult?.success) {
                throw new Error(repoResult?.error || 'Failed to check git repository')
            }

            if (!repoResult.isGitRepo) {
                if (isStaleRefresh()) return
                unstable_batchedUpdates(() => {
                    setGitError(null)
                    setIsGitRepo(false)
                    gitStatusDetailsRef.current = []
                    setGitStatusDetails([])
                    setGitHistory([])
                    setGitHistoryTotalCount(0)
                    setIncomingCommits([])
                    setUnpushedCommits([])
                    setGitUser(null)
                    setRepoOwner(null)
                    setHasRemote(false)
                    setGitSyncStatus(null)
                    setGitStatusMap(createEmptyGitStateMap())
                    setBranches([])
                    setRemotes([])
                    setTags([])
                    setStashes([])
                })
                return
            }

            const readErrors: string[] = []
            const appendError = (label: string, error: unknown) => {
                const message = error instanceof Error ? error.message : String(error || 'request failed')
                readErrors.push(`${label}: ${message}`)
            }

            const applyDetailedStatus = (details: GitStatusDetail[]) => {
                const mergedDetails = mergeGitStatusDetailStats(gitStatusDetailsRef.current, details)
                const statusMap: Record<string, FileTreeNode['gitStatus']> = {}
                for (const detail of mergedDetails) {
                    statusMap[detail.path] = detail.status
                    statusMap[detail.path.replace(/\//g, '\\')] = detail.status
                    if (detail.previousPath) {
                        statusMap[detail.previousPath] = 'renamed'
                        statusMap[detail.previousPath.replace(/\//g, '\\')] = 'renamed'
                    }
                }
                gitStatusDetailsRef.current = mergedDetails
                setGitStatusDetails(mergedDetails)
                setGitStatusMap(statusMap)
            }

            setIsGitRepo(true)

            const includeStatusStats = activeTab === 'git' && gitView === 'changes'

            if (mode === 'working') {
                try {
                    const statusResult = await window.devscope.getGitStatusDetailed(refreshPath, {
                        includeStats: includeStatusStats
                    })
                    if (isStaleRefresh()) return
                    if (statusResult?.success) {
                        applyDetailedStatus((statusResult.entries || []) as GitStatusDetail[])
                    } else {
                        appendError('status', statusResult?.error || 'request failed')
                    }
                } catch (error) {
                    if (isStaleRefresh()) return
                    appendError('status', error)
                }

                setGitError(readErrors.length > 0 ? readErrors.join(' | ') : null)
                return
            }

            const shouldLoadIdentity = mode === 'full'
            const shouldLoadManageMetadata = mode === 'full'
            const shouldLoadSync = true
            const shouldLoadUnpushed = mode === 'full' || mode === 'unpushed'
            const shouldLoadHistory = mode === 'full' || mode === 'history'
            const shouldLoadHistoryCount = mode === 'full' || mode === 'history'
            const shouldLoadIncomingCommits = mode === 'pulls' || (mode === 'full' && activeTab === 'git' && (gitView === 'pulls' || gitView === 'manage'))
            const tasks: Array<{
                label: string
                task: Promise<any>
                apply: (result: any) => void
            }> = [
                {
                    label: 'status',
                    task: window.devscope.getGitStatusDetailed(refreshPath, {
                        includeStats: includeStatusStats
                    }),
                    apply: (result) => {
                        if (result?.success) {
                            applyDetailedStatus((result.entries || []) as GitStatusDetail[])
                            return
                        }
                        appendError('status', result?.error || 'request failed')
                    }
                }
            ]

            if (shouldLoadSync) {
                tasks.push({
                    label: 'sync',
                    task: window.devscope.getGitSyncStatus(refreshPath),
                    apply: (result) => {
                        if (result?.success) {
                            setGitSyncStatus(result.sync || null)
                            setHasRemote(result.sync?.hasRemote ?? false)
                            gitSensorTokenRef.current = result.sync?.statusToken || null
                            return
                        }
                        appendError('sync', result?.error || 'request failed')
                    }
                })
            }

            if (shouldLoadIdentity) {
                tasks.push({
                    label: 'user',
                    task: window.devscope.getGitUser(refreshPath),
                    apply: (result) => {
                        if (result?.success) {
                            setGitUser(result.user || null)
                            return
                        }
                        appendError('user', result?.error || 'request failed')
                    }
                })
            }

            if (shouldLoadUnpushed) {
                tasks.push({
                    label: 'unpushed',
                    task: window.devscope.getUnpushedCommits(refreshPath),
                    apply: (result) => {
                        if (result?.success) {
                            setUnpushedCommits((prev) => mergeCommitStats(prev, result.commits || []))
                            return
                        }
                        appendError('unpushed', result?.error || 'request failed')
                    }
                })
            }

            if (shouldLoadHistory) {
                tasks.push({
                    label: 'history',
                    task: window.devscope.getGitHistory(refreshPath, historyLimit, {
                        all: false,
                        includeStats: false
                    }),
                    apply: (result) => {
                        if (result?.success) {
                            setGitHistory((prev) => mergeCommitStats(prev, result.commits || []))
                            return
                        }
                        appendError('history', result?.error || 'request failed')
                    }
                })
            }

            if (shouldLoadHistoryCount) {
                tasks.push({
                    label: 'history-count',
                    task: window.devscope.getGitHistoryCount(refreshPath, { all: false }),
                    apply: (result) => {
                        if (result?.success) {
                            setGitHistoryTotalCount(typeof result.totalCount === 'number' ? Math.max(0, result.totalCount) : 0)
                            return
                        }
                        appendError('history-count', result?.error || 'request failed')
                    }
                })
            }

            if (shouldLoadIncomingCommits) {
                tasks.push({
                    label: 'incoming',
                    task: window.devscope.getIncomingCommits(refreshPath, INCOMING_COMMITS_LIMIT),
                    apply: (result) => {
                        if (result?.success) {
                            setIncomingCommits(result.commits || [])
                            return
                        }
                        appendError('incoming', result?.error || 'request failed')
                    }
                })
            }

            if (shouldLoadManageMetadata) {
                tasks.push(
                    {
                        label: 'branches',
                        task: window.devscope.listBranches(refreshPath),
                        apply: (result) => {
                            if (result?.success) {
                                setBranches(result.branches || [])
                                return
                            }
                            appendError('branches', result?.error || 'request failed')
                        }
                    },
                    {
                        label: 'remotes',
                        task: window.devscope.listRemotes(refreshPath),
                        apply: (result) => {
                            if (result?.success) {
                                const nextRemotes = result.remotes || []
                                setRemotes(nextRemotes)
                                if (shouldLoadIdentity) {
                                    setRepoOwner(resolveRepoOwnerFromRemotes(nextRemotes))
                                }
                                return
                            }
                            appendError('remotes', result?.error || 'request failed')
                        }
                    },
                    {
                        label: 'tags',
                        task: window.devscope.listTags(refreshPath),
                        apply: (result) => {
                            if (result?.success) {
                                setTags(result.tags || [])
                                return
                            }
                            appendError('tags', result?.error || 'request failed')
                        }
                    },
                    {
                        label: 'stashes',
                        task: window.devscope.listStashes(refreshPath),
                        apply: (result) => {
                            if (result?.success) {
                                setStashes(result.stashes || [])
                                return
                            }
                            appendError('stashes', result?.error || 'request failed')
                        }
                    }
                )
            }

            const settledTasks = await Promise.allSettled(tasks.map((entry) => entry.task))
            if (isStaleRefresh()) return

            unstable_batchedUpdates(() => {
                settledTasks.forEach((result, index) => {
                    if (result.status === 'rejected') {
                        appendError(tasks[index].label, result.reason)
                        return
                    }
                    tasks[index].apply(result.value)
                })
            })

            if (readErrors.length > 0) {
                const preview = readErrors.slice(0, 3).join(' | ')
                const suffix = readErrors.length > 3 ? ` (+${readErrors.length - 3} more)` : ''
                setGitError(`Git data partially loaded: ${preview}${suffix}`)
            } else {
                setGitError(null)
            }
        } catch (err: any) {
            if (!isStaleRefresh()) {
                setGitError(err?.message || 'Failed to load git details')
            }
        } finally {
            if (!isStaleRefresh()) {
                if (!quiet) {
                    if (shouldUseHistoryLoading) {
                        setLoadingGitHistory(false)
                    } else {
                        setLoadingGit(false)
                    }
                }
            }
        }
    }, [
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
        branches,
        remotes,
        tags,
        stashes,
        historyLimit,
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
        refreshGitForegroundRequestRef,
        refreshGitBackgroundRequestRef,
        gitStatusDetailsRef,
        gitSensorTokenRef,
        activePathRef,
        params
    ])
    const executeRefreshRef = useRef(executeRefresh)

    useEffect(() => {
        executeRefreshRef.current = executeRefresh
    }, [executeRefresh])

    return useCallback((
        refreshFilesToo: boolean = false,
        options?: { quiet?: boolean; mode?: GitRefreshMode }
    ) => {
        if (!decodedPath) {
            return Promise.resolve()
        }

        refreshQueueRef.current.push({
            refreshFilesToo: Boolean(refreshFilesToo),
            quiet: Boolean(options?.quiet),
            mode: options?.mode || 'full'
        })

        if (!refreshDrainPromiseRef.current) {
            let drainPromise: Promise<void> | null = null
            drainPromise = (async () => {
                try {
                    while (refreshQueueRef.current.length > 0) {
                        const nextBatch = refreshQueueRef.current.splice(0)
                        const nextRequest = collapseQueuedGitRefreshRequests(nextBatch)
                        if (!nextRequest) continue
                        await executeRefreshRef.current(nextRequest)
                    }
                } finally {
                    if (refreshDrainPromiseRef.current === drainPromise) {
                        refreshDrainPromiseRef.current = null
                    }
                }
            })()
            refreshDrainPromiseRef.current = drainPromise
        }

        return refreshDrainPromiseRef.current
    }, [decodedPath])
}
