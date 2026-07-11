import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { GitCommit, GitStatusDetail } from './types'
import {
    WORKING_CHANGE_STATS_CHUNK_SIZE,
    mergeHistoryCommitStats,
    normalizeWorkingChangePath
} from './projectDetailsPageHelpers'

type UseProjectGitStatsParams = {
    activeTab: 'readme' | 'files' | 'git'
    gitView: 'changes' | 'history' | 'unpushed' | 'pulls' | 'manage'
    decodedPath: string
    gitHistory: GitCommit[]
    gitHistoryTotalCount: number
    commitPage: number
    COMMITS_PER_PAGE: number
    setGitHistory: Dispatch<SetStateAction<GitCommit[]>>
    unpushedCommits: GitCommit[]
    unpushedPage: number
    ITEMS_PER_PAGE: number
    setUnpushedCommits: Dispatch<SetStateAction<GitCommit[]>>
    historyStatsRequestRef: MutableRefObject<number>
    unpushedStatsRequestRef: MutableRefObject<number>
    historyLimit: number
    HISTORY_CHUNK_SIZE: number
    loadingMoreHistory: boolean
    setLoadingMoreHistory: Dispatch<SetStateAction<boolean>>
    setHistoryLimit: Dispatch<SetStateAction<number>>
    gitStatusDetails: GitStatusDetail[]
    setGitStatusDetails: Dispatch<SetStateAction<GitStatusDetail[]>>
}

export function useProjectGitStats({
    activeTab,
    gitView,
    decodedPath,
    gitHistory,
    gitHistoryTotalCount,
    commitPage,
    COMMITS_PER_PAGE,
    setGitHistory,
    unpushedCommits,
    unpushedPage,
    ITEMS_PER_PAGE,
    setUnpushedCommits,
    historyStatsRequestRef,
    unpushedStatsRequestRef,
    historyLimit,
    HISTORY_CHUNK_SIZE,
    loadingMoreHistory,
    setLoadingMoreHistory,
    setHistoryLimit,
    gitStatusDetails,
    setGitStatusDetails
}: UseProjectGitStatsParams) {
    const workingStatsPendingPathsRef = useRef<Set<string>>(new Set())
    const workingStatsPrefetchVersionRef = useRef(0)

    useEffect(() => {
        workingStatsPendingPathsRef.current.clear()
        workingStatsPrefetchVersionRef.current += 1
    }, [decodedPath])

    useEffect(() => {
        if (activeTab !== 'git' || gitHistory.length === 0) return

        const targetCommits = gitView === 'history'
            ? gitHistory.slice(
                Math.max(0, (commitPage - 1) * COMMITS_PER_PAGE),
                Math.max(Math.max(0, (commitPage - 1) * COMMITS_PER_PAGE), commitPage * COMMITS_PER_PAGE)
            )
            : gitView === 'manage'
                ? gitHistory.slice(0, 3)
                : []

        if (targetCommits.length === 0) return

        const missingStatsHashes = targetCommits
            .filter((commit) => commit.statsLoaded !== true)
            .map((commit) => commit.hash)

        if (missingStatsHashes.length === 0) return

        const requestId = ++historyStatsRequestRef.current

        void window.devscope.getGitCommitStats(decodedPath, missingStatsHashes).then((result) => {
            if (requestId !== historyStatsRequestRef.current || !result?.success || !Array.isArray(result.commits)) {
                return
            }

            const statsByHash = new Map(result.commits.map((commit) => [commit.hash, commit]))
            if (statsByHash.size === 0) return

            setGitHistory((prev) => {
                let changed = false
                const next = prev.map((commit) => {
                    const stats = statsByHash.get(commit.hash)
                    if (!stats) return commit

                    const shouldUpdate =
                        commit.statsLoaded !== true
                        || commit.additions !== stats.additions
                        || commit.deletions !== stats.deletions
                        || commit.filesChanged !== stats.filesChanged

                    if (!shouldUpdate) return commit

                    changed = true
                    return {
                        ...commit,
                        additions: stats.additions,
                        deletions: stats.deletions,
                        filesChanged: stats.filesChanged,
                        statsLoaded: true
                    }
                })

                return changed ? next : prev
            })
        })
    }, [activeTab, commitPage, decodedPath, gitHistory, gitView, COMMITS_PER_PAGE, historyStatsRequestRef, setGitHistory])

    useEffect(() => {
        if (activeTab !== 'git' || unpushedCommits.length === 0) return

        const pageStart = Math.max(0, (unpushedPage - 1) * ITEMS_PER_PAGE)
        const pageEnd = Math.max(pageStart, unpushedPage * ITEMS_PER_PAGE)
        const missingStatsHashes = unpushedCommits
            .slice(pageStart, pageEnd)
            .filter((commit) => commit.statsLoaded !== true)
            .map((commit) => commit.hash)

        if (missingStatsHashes.length === 0) return

        const requestId = ++unpushedStatsRequestRef.current

        void window.devscope.getGitCommitStats(decodedPath, missingStatsHashes).then((result) => {
            if (requestId !== unpushedStatsRequestRef.current || !result?.success || !Array.isArray(result.commits)) {
                return
            }

            const statsByHash = new Map(result.commits.map((commit) => [commit.hash, commit]))
            if (statsByHash.size === 0) return

            setUnpushedCommits((prev) => {
                let changed = false
                const next = prev.map((commit) => {
                    const stats = statsByHash.get(commit.hash)
                    if (!stats) return commit

                    const shouldUpdate =
                        commit.statsLoaded !== true
                        || commit.additions !== stats.additions
                        || commit.deletions !== stats.deletions
                        || commit.filesChanged !== stats.filesChanged

                    if (!shouldUpdate) return commit

                    changed = true
                    return {
                        ...commit,
                        additions: stats.additions,
                        deletions: stats.deletions,
                        filesChanged: stats.filesChanged,
                        statsLoaded: true
                    }
                })

                return changed ? next : prev
            })
        })
    }, [activeTab, decodedPath, ITEMS_PER_PAGE, unpushedCommits, unpushedPage, setUnpushedCommits, unpushedStatsRequestRef])

    useEffect(() => {
        if (gitHistory.length === 0) return

        const normalizedHistoryLimit = Math.max(
            HISTORY_CHUNK_SIZE,
            Math.ceil(gitHistory.length / HISTORY_CHUNK_SIZE) * HISTORY_CHUNK_SIZE
        )
        setHistoryLimit((prev) => (prev < normalizedHistoryLimit ? normalizedHistoryLimit : prev))
    }, [HISTORY_CHUNK_SIZE, gitHistory.length, setHistoryLimit])

    const stagedFiles = useMemo(() => (
        gitStatusDetails
            .filter((item) => item.staged)
            .map((item) => {
                const normalizedPath = normalizeWorkingChangePath(item.path)
                const segments = normalizedPath.split('/').filter(Boolean)
                const name = segments[segments.length - 1] || normalizedPath
                return { ...item, path: normalizedPath, name, gitStatus: item.status }
            })
            .sort((a, b) => a.path.localeCompare(b.path))
    ), [gitStatusDetails])

    const unstagedFiles = useMemo(() => (
        gitStatusDetails
            .filter((item) => item.unstaged)
            .map((item) => {
                const normalizedPath = normalizeWorkingChangePath(item.path)
                const segments = normalizedPath.split('/').filter(Boolean)
                const name = segments[segments.length - 1] || normalizedPath
                return { ...item, path: normalizedPath, name, gitStatus: item.status }
            })
            .sort((a, b) => a.path.localeCompare(b.path))
    ), [gitStatusDetails])

    const gitStatusStatsLoadedMap = useMemo(() => {
        const next = new Map<string, boolean>()
        for (const detail of gitStatusDetails) {
            next.set(normalizeWorkingChangePath(detail.path), detail.statsLoaded === true)
        }
        return next
    }, [gitStatusDetails])

    const ensureWorkingChangeStats = useCallback(async (paths: string[]) => {
        if (!decodedPath || paths.length === 0) return

        const normalizedPaths = Array.from(
            new Set(
                paths
                    .map((path) => normalizeWorkingChangePath(path))
                    .filter(Boolean)
            )
        )

        if (normalizedPaths.length === 0) return

        const pendingPaths = workingStatsPendingPathsRef.current
        const missingPaths = normalizedPaths.filter((path) => {
            if (pendingPaths.has(path)) return false
            return gitStatusStatsLoadedMap.get(path) !== true
        })

        if (missingPaths.length === 0) return

        missingPaths.forEach((path) => pendingPaths.add(path))

        try {
            const result = await window.devscope.getGitStatusEntryStats(decodedPath, missingPaths)
            const statsEntries = result?.success ? result.entries || [] : []
            const statsByPath = new Map(statsEntries.map((entry) => [normalizeWorkingChangePath(entry.path), entry]))
            const missingPathSet = new Set(missingPaths)

            setGitStatusDetails((prev) => prev.map((detail) => {
                const normalizedPath = normalizeWorkingChangePath(detail.path)
                if (!missingPathSet.has(normalizedPath)) return detail

                const stats = statsByPath.get(normalizedPath)
                if (!stats) {
                    return {
                        ...detail,
                        statsLoaded: true
                    }
                }

                return {
                    ...detail,
                    additions: stats.additions,
                    deletions: stats.deletions,
                    stagedAdditions: stats.stagedAdditions,
                    stagedDeletions: stats.stagedDeletions,
                    unstagedAdditions: stats.unstagedAdditions,
                    unstagedDeletions: stats.unstagedDeletions,
                    statsLoaded: true
                }
            }))
        } finally {
            missingPaths.forEach((path) => pendingPaths.delete(path))
        }
    }, [decodedPath, gitStatusStatsLoadedMap, setGitStatusDetails])

    useEffect(() => {
        if (!decodedPath || gitStatusDetails.length === 0) return

        const missingPaths = gitStatusDetails
            .filter((detail) => detail.statsLoaded !== true)
            .map((detail) => normalizeWorkingChangePath(detail.path))
            .filter(Boolean)

        if (missingPaths.length === 0) return

        const runId = ++workingStatsPrefetchVersionRef.current

        void (async () => {
            for (let index = 0; index < missingPaths.length; index += WORKING_CHANGE_STATS_CHUNK_SIZE) {
                if (workingStatsPrefetchVersionRef.current !== runId) {
                    return
                }

                const chunk = missingPaths.slice(index, index + WORKING_CHANGE_STATS_CHUNK_SIZE)
                await ensureWorkingChangeStats(chunk)

                if (workingStatsPrefetchVersionRef.current !== runId) {
                    return
                }

                if (index + WORKING_CHANGE_STATS_CHUNK_SIZE < missingPaths.length) {
                    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
                }
            }
        })()

        return () => {
            if (workingStatsPrefetchVersionRef.current === runId) {
                workingStatsPrefetchVersionRef.current += 1
            }
        }
    }, [decodedPath, ensureWorkingChangeStats, gitStatusDetails])

    const historyHasMore = gitHistoryTotalCount > gitHistory.length

    const loadMoreGitHistory = useCallback(async () => {
        if (!decodedPath || loadingMoreHistory) return false
        if (gitHistoryTotalCount > 0 && gitHistory.length >= gitHistoryTotalCount) return false

        const nextLimit = historyLimit + HISTORY_CHUNK_SIZE
        setLoadingMoreHistory(true)

        try {
            const result = await window.devscope.getGitHistory(decodedPath, nextLimit, {
                all: false,
                includeStats: false
            })
            if (!result?.success) {
                return false
            }

            const nextCommits = result.commits || []
            setHistoryLimit(nextLimit)

            if (nextCommits.length <= gitHistory.length) {
                return false
            }

            setGitHistory((prev) => mergeHistoryCommitStats(prev, nextCommits))
            return true
        } finally {
            setLoadingMoreHistory(false)
        }
    }, [
        HISTORY_CHUNK_SIZE,
        decodedPath,
        gitHistory.length,
        gitHistoryTotalCount,
        historyLimit,
        loadingMoreHistory,
        setGitHistory,
        setHistoryLimit,
        setLoadingMoreHistory
    ])

    return {
        stagedFiles,
        unstagedFiles,
        ensureWorkingChangeStats,
        historyHasMore,
        loadMoreGitHistory
    }
}
