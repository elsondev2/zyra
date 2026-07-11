import { useEffect, type MutableRefObject } from 'react'
import { getRefreshModeForGitView, hasFocusedGitDataForView, INCOMING_COMMITS_LIMIT, type GitRefreshMode } from './gitLifecycleUtils'
import type { GitLifecycleDataState, UseProjectGitLifecycleParams } from './types'

function buildGitDataState(input: UseProjectGitLifecycleParams): GitLifecycleDataState {
    return {
        gitView: input.gitView,
        isGitRepo: input.isGitRepo,
        gitStatusDetails: input.gitStatusDetails,
        gitHistory: input.gitHistory,
        gitHistoryTotalCount: input.gitHistoryTotalCount,
        incomingCommits: input.incomingCommits,
        unpushedCommits: input.unpushedCommits,
        gitUser: input.gitUser,
        repoOwner: input.repoOwner,
        hasRemote: input.hasRemote,
        gitSyncStatus: input.gitSyncStatus,
        branches: input.branches,
        remotes: input.remotes,
        tags: input.tags,
        stashes: input.stashes
    }
}

export function useProjectGitAutoRefresh(
    params: UseProjectGitLifecycleParams,
    controls: {
        refreshGitData: (refreshFilesToo?: boolean, options?: { quiet?: boolean; mode?: GitRefreshMode }) => Promise<void>
        refreshGitDataRef: MutableRefObject<((refreshFilesToo?: boolean, options?: { quiet?: boolean; mode?: GitRefreshMode }) => Promise<void>) | null>
        previousGitTabStateRef: MutableRefObject<{ activeTab: UseProjectGitLifecycleParams['activeTab']; decodedPath: string; gitView: UseProjectGitLifecycleParams['gitView'] }>
        gitSensorTokenRef: MutableRefObject<string | null>
    }
): void {
    const {
        decodedPath,
        activeTab,
        gitView,
        autoRefreshGitOnProjectOpen,
        gitSyncStatus,
        setGitSyncStatus,
        setHasRemote,
        setIncomingCommits
    } = params
    const {
        refreshGitData,
        refreshGitDataRef,
        previousGitTabStateRef,
        gitSensorTokenRef
    } = controls

    useEffect(() => {
        if (!decodedPath) return
        if (activeTab === 'git') return
        void refreshGitDataRef.current?.(false, { quiet: true, mode: 'full' })
    }, [activeTab, decodedPath, refreshGitDataRef])

    useEffect(() => {
        const previous = previousGitTabStateRef.current
        const enteringGitTab = previous.activeTab !== 'git' || previous.decodedPath !== decodedPath
        const switchingGitView = previous.activeTab === 'git'
            && previous.decodedPath === decodedPath
            && previous.gitView !== gitView

        previousGitTabStateRef.current = {
            activeTab,
            decodedPath,
            gitView
        }

        if (activeTab !== 'git' || !decodedPath) return

        const mode = getRefreshModeForGitView(gitView)
        const hasFocusedData = hasFocusedGitDataForView(buildGitDataState(params))

        if (switchingGitView && hasFocusedData) {
            return
        }

        void refreshGitData(false, hasFocusedData && enteringGitTab ? { quiet: true, mode } : { mode })
    }, [activeTab, decodedPath, gitView, params, refreshGitData, previousGitTabStateRef])

    useEffect(() => {
        if (!decodedPath || !autoRefreshGitOnProjectOpen) return
        const intervalId = window.setInterval(() => {
            void refreshGitDataRef.current?.(false, { quiet: true, mode: 'working' })
        }, 12000)
        return () => window.clearInterval(intervalId)
    }, [autoRefreshGitOnProjectOpen, decodedPath, refreshGitDataRef])

    useEffect(() => {
        if (!decodedPath || activeTab !== 'git' || gitView !== 'changes' || autoRefreshGitOnProjectOpen) return
        const intervalId = window.setInterval(() => {
            void refreshGitDataRef.current?.(false, { quiet: true, mode: 'working' })
        }, 45000)
        return () => window.clearInterval(intervalId)
    }, [activeTab, autoRefreshGitOnProjectOpen, decodedPath, gitView, refreshGitDataRef])

    useEffect(() => {
        if (!decodedPath || activeTab !== 'git' || gitView === 'changes') return
        const intervalId = window.setInterval(() => {
            void refreshGitDataRef.current?.(false, { quiet: true, mode: getRefreshModeForGitView(gitView) })
        }, 90000)
        return () => window.clearInterval(intervalId)
    }, [activeTab, decodedPath, gitView, refreshGitDataRef])

    useEffect(() => {
        if (!decodedPath || !autoRefreshGitOnProjectOpen) return

        let cancelled = false

        const pollSyncStatus = async () => {
            try {
                const result = await window.devscope.getGitSyncStatus(decodedPath)
                if (cancelled || !result?.success || !result.sync) return

                const previousToken = gitSensorTokenRef.current
                const nextToken = result.sync.statusToken
                gitSensorTokenRef.current = nextToken
                setGitSyncStatus(result.sync)
                setHasRemote(result.sync.hasRemote)

                if (result.sync.behind > 0 && activeTab === 'git' && (gitView === 'pulls' || gitView === 'manage')) {
                    const incomingResult = await window.devscope.getIncomingCommits(decodedPath, INCOMING_COMMITS_LIMIT)
                    if (!cancelled && incomingResult?.success) {
                        setIncomingCommits(incomingResult.commits || [])
                    }
                } else if (result.sync.behind === 0 && activeTab === 'git' && (gitView === 'pulls' || gitView === 'manage')) {
                    setIncomingCommits([])
                }

                if (!previousToken || previousToken === nextToken) return

                const shouldRunFullRefresh = result.sync.headHash !== gitSyncStatus?.headHash
                    || result.sync.upstreamHeadHash !== gitSyncStatus?.upstreamHeadHash
                    || result.sync.ahead !== gitSyncStatus?.ahead
                    || result.sync.behind !== gitSyncStatus?.behind
                    || result.sync.currentBranch !== gitSyncStatus?.currentBranch

                void refreshGitData(false, {
                    quiet: true,
                    mode: shouldRunFullRefresh ? getRefreshModeForGitView(gitView) : 'working'
                })
            } catch {
                // Keep the sensor silent.
            }
        }

        void pollSyncStatus()
        const intervalId = window.setInterval(() => {
            void pollSyncStatus()
        }, 15000)

        return () => {
            cancelled = true
            window.clearInterval(intervalId)
        }
    }, [
        activeTab,
        autoRefreshGitOnProjectOpen,
        decodedPath,
        gitSyncStatus?.ahead,
        gitSyncStatus?.behind,
        gitSyncStatus?.currentBranch,
        gitSyncStatus?.headHash,
        gitSyncStatus?.upstreamHeadHash,
        gitView,
        refreshGitData,
        setGitSyncStatus,
        setHasRemote,
        setIncomingCommits,
        gitSensorTokenRef
    ])
}
