import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildGitPublishPlan } from '@/lib/gitPublishPlanner'
import { invalidateProjectGitOverview } from '@/lib/projectGitOverview'
import { useGitHubPublishContext } from './useGitHubPublishContext'
import type { GitCommit } from './types'

type GitViewModelParams = {
    repoOwner?: string
    gitUser?: { name?: string; email?: string }
    remotes?: any[]
    decodedPath?: string
    hasRemote?: boolean | null
    currentBranch?: string
    branches?: any[]
    unpushedCommits: GitCommit[]
    incomingCommits: any[]
    gitSyncStatus?: any
    loadingGit?: boolean
    gitError?: string | null
    loadingGitHistory?: boolean
    gitHistory: GitCommit[]
    gitHistoryTotalCount?: number
    commitPage: number
    setCommitPage: (updater: number | ((value: number) => number)) => void
    COMMITS_PER_PAGE: number
    historyHasMore?: boolean
    loadingMoreHistory?: boolean
    loadMoreGitHistory?: () => Promise<boolean>
    pullsPage: number
    ITEMS_PER_PAGE: number
    lastFetched?: number
    lastPulled?: number
    handleFetch: (remoteName?: string, successMessage?: string) => Promise<void>
    handlePull: (options?: any) => Promise<void>
    refreshGitData: (force?: boolean, options?: any) => Promise<void>
    showToast: (message: string, a?: any, b?: any, level?: string) => void
}

function isGitHubRemoteUrl(remoteUrl: string) {
    return /github\.com[:/]/i.test(String(remoteUrl || '').trim())
}

function parseGitHubRemoteFullName(remoteUrl: string) {
    const trimmed = String(remoteUrl || '').trim()
    if (!trimmed) return null

    const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i)
    if (sshMatch) {
        return `${sshMatch[1]}/${sshMatch[2].replace(/\.git$/i, '')}`
    }

    try {
        const url = new URL(trimmed)
        if (!/github\.com$/i.test(url.hostname)) return null
        const segments = url.pathname.split('/').filter(Boolean)
        if (segments.length < 2) return null
        return `${segments[0]}/${segments[1].replace(/\.git$/i, '')}`
    } catch {
        return null
    }
}

function normalizeIdentityToken(value: string | null | undefined) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, '')
}

function isVerbosePublishLine(line: string) {
    return /^Remote "/.test(line)
}

export function useProjectDetailsGitViewModel({
    repoOwner,
    gitUser,
    remotes,
    decodedPath,
    hasRemote,
    currentBranch,
    branches,
    unpushedCommits,
    incomingCommits,
    gitSyncStatus,
    loadingGit,
    gitError,
    loadingGitHistory,
    gitHistory,
    gitHistoryTotalCount,
    commitPage,
    setCommitPage,
    COMMITS_PER_PAGE,
    historyHasMore,
    loadingMoreHistory,
    loadMoreGitHistory,
    pullsPage,
    ITEMS_PER_PAGE,
    lastFetched,
    lastPulled,
    handleFetch,
    handlePull,
    refreshGitData,
    showToast
}: GitViewModelParams) {
    const githubRemoteUrls = useMemo(
        () => (remotes || []).map((remote: any) => String(remote.pushUrl || '')).filter(Boolean),
        [remotes]
    )
    const {
        context: githubPublishContext,
        loading: loadingGitHubPublishContext,
        error: gitHubPublishContextError,
        refresh: refreshGitHubPublishContext
    } = useGitHubPublishContext({
        projectPath: decodedPath || '',
        enabled: hasRemote === true,
        remoteUrls: githubRemoteUrls
    })

    const hasGitHubRemote = useMemo(
        () => githubRemoteUrls.some((remoteUrl) => isGitHubRemoteUrl(remoteUrl)),
        [githubRemoteUrls]
    )
    const originRemote = useMemo(
        () => (remotes || []).find((remote: any) => remote.name === 'origin') || null,
        [remotes]
    )
    const originRemoteFullName = useMemo(
        () => parseGitHubRemoteFullName(String(originRemote?.pushUrl || originRemote?.fetchUrl || '')),
        [originRemote]
    )
    const configuredUpstreamRemote = useMemo(() => {
        const upstreamFullName = githubPublishContext?.upstream?.fullName
        if (!upstreamFullName) return null

        return (remotes || []).find((remote: any) => {
            const remoteFullName = parseGitHubRemoteFullName(String(remote.pushUrl || remote.fetchUrl || ''))
            return remoteFullName === upstreamFullName && remote.name !== 'origin'
        }) || null
    }, [githubPublishContext?.upstream?.fullName, remotes])

    const effectiveUpstreamRemoteName = configuredUpstreamRemote?.name
        || (originRemoteFullName && originRemoteFullName === githubPublishContext?.upstream?.fullName ? originRemote?.name : null)

    const repoUsesForkOrigin = Boolean(
        originRemoteFullName
        && githubPublishContext?.upstream?.fullName
        && originRemoteFullName !== githubPublishContext.upstream.fullName
    )
    const upstreamRepoDisplay = githubPublishContext?.upstream?.fullName || 'Not configured'
    const originRepoDisplay = originRemoteFullName || originRemote?.name || 'Not configured'
    const canFetchOrigin = Boolean(originRemote?.name)
    const canFetchUpstream = Boolean(
        effectiveUpstreamRemoteName
        || (repoUsesForkOrigin && githubPublishContext?.upstream?.cloneUrl)
    )
    const canSyncFromUpstream = Boolean(
        repoUsesForkOrigin
        && originRemote?.name
        && currentBranch
        && (effectiveUpstreamRemoteName || githubPublishContext?.upstream?.cloneUrl)
    )
    const showFetchUpstreamButton = Boolean(repoUsesForkOrigin && canFetchUpstream)

    const pushAccessIndicator = useMemo(() => {
        const ownerToken = normalizeIdentityToken(repoOwner)
        const gitUserNameToken = normalizeIdentityToken(gitUser?.name)
        const gitUserEmailToken = normalizeIdentityToken(String(gitUser?.email || '').split('@')[0])
        const inferredOwnerMatch = Boolean(
            ownerToken
            && (ownerToken === gitUserNameToken || ownerToken === gitUserEmailToken)
        )

        return {
            allowed: inferredOwnerMatch,
            inferred: inferredOwnerMatch
        }
    }, [gitUser?.email, gitUser?.name, repoOwner])

    const pushPlan = useMemo(
        () => buildGitPublishPlan({
            currentBranch: currentBranch || '',
            branches: branches || [],
            remotes: remotes || [],
            unpushedCommits,
            intent: 'push-all',
            githubPublishContext
        }),
        [branches, currentBranch, githubPublishContext, remotes, unpushedCommits]
    )
    const compactPushSummaryLines = useMemo(
        () => pushPlan.summaryLines.filter((line) => !isVerbosePublishLine(line)),
        [pushPlan.summaryLines]
    )
    const currentBranchNeedsPublish = pushPlan.currentBranchNeedsPublish
    const showPushAction = hasRemote === true && (unpushedCommits.length > 0 || currentBranchNeedsPublish)

    const visibleHistorySource = gitHistory
    const historyPageStart = Math.max(0, (commitPage - 1) * COMMITS_PER_PAGE)
    const historyPageEnd = Math.max(historyPageStart, commitPage * COMMITS_PER_PAGE)
    const visibleHistoryCommits = useMemo(
        () => visibleHistorySource.slice(historyPageStart, historyPageEnd),
        [historyPageEnd, historyPageStart, visibleHistorySource]
    )
    const effectiveHistoryTotalCount = Math.max(gitHistoryTotalCount || 0, visibleHistorySource.length)
    const totalHistoryPages = Math.max(1, Math.ceil(effectiveHistoryTotalCount / COMMITS_PER_PAGE))
    const gitCountsLoading = Boolean(loadingGit && !gitError)
    const unpushedStatsLoading = gitCountsLoading && unpushedCommits.length === 0
    const incomingStatsLoading = gitCountsLoading && incomingCommits.length === 0 && !gitSyncStatus
    const historyLoading = Boolean(loadingGitHistory && !gitError)
    const hasFetchedSinceLastPull = Boolean(lastFetched && (!lastPulled || lastFetched > lastPulled))
    const shouldHighlightPull = hasFetchedSinceLastPull && (gitSyncStatus?.behind || 0) > 0

    const pullStatusItems = useMemo(() => {
        if (incomingStatsLoading) {
            return ['Loading']
        }

        const items: string[] = []
        items.push(
            gitSyncStatus?.workingTreeChanged
                ? `${gitSyncStatus.workingTreeChangeCount} local change${gitSyncStatus.workingTreeChangeCount === 1 ? '' : 's'}`
                : 'Clean'
        )
        items.push(repoUsesForkOrigin ? 'Syncs upstream to fork' : `Pulls ${currentBranch || 'branch'}`)
        if (shouldHighlightPull) {
            items.push('Ready to pull')
        }
        return items
    }, [
        currentBranch,
        gitSyncStatus?.workingTreeChangeCount,
        gitSyncStatus?.workingTreeChanged,
        incomingStatsLoading,
        repoUsesForkOrigin,
        shouldHighlightPull
    ])

    const pagedIncomingCommits = useMemo(
        () => incomingCommits.slice((pullsPage - 1) * ITEMS_PER_PAGE, pullsPage * ITEMS_PER_PAGE),
        [ITEMS_PER_PAGE, incomingCommits, pullsPage]
    )
    const localOnlyCommitHashes = useMemo(
        () => new Set<string>(unpushedCommits.map((commit) => commit.hash)),
        [unpushedCommits]
    )

    const [activeFetchTarget, setActiveFetchTarget] = useState<'origin' | 'upstream' | null>(null)
    const [activeUpdateTarget, setActiveUpdateTarget] = useState<'origin' | 'upstream' | null>(null)
    const upstreamLinkAttemptRef = useRef<string | null>(null)
    const refreshLinkedUpstreamInBackground = useCallback(() => {
        void refreshGitData(false, { quiet: true, mode: 'full' }).catch((error: any) => {
            console.error('[GitTab] Failed to refresh linked upstream state', error)
        })
    }, [refreshGitData])

    const remoteHeadCommitHash = useMemo(() => {
        if (hasRemote !== true) return null
        const firstRemoteCommit = visibleHistorySource.find((commit) => !localOnlyCommitHashes.has(commit.hash))
        return firstRemoteCommit?.hash ?? null
    }, [hasRemote, localOnlyCommitHashes, visibleHistorySource])

    const handleNextHistoryPage = async () => {
        if (commitPage < totalHistoryPages) {
            setCommitPage((page: number) => Math.min(totalHistoryPages, page + 1))
            return
        }

        if (!historyHasMore || loadingMoreHistory) return

        const loadedMore = await loadMoreGitHistory?.()
        if (loadedMore) {
            setCommitPage((page: number) => page + 1)
        }
    }

    useEffect(() => {
        const upstreamCloneUrl = githubPublishContext?.upstream?.cloneUrl
        const upstreamFullName = githubPublishContext?.upstream?.fullName
        if (!decodedPath || !repoUsesForkOrigin || !upstreamCloneUrl || !upstreamFullName) {
            return
        }

        const linkedRemote = (remotes || []).find((remote: any) => {
            const remoteFullName = parseGitHubRemoteFullName(String(remote.pushUrl || remote.fetchUrl || ''))
            return remoteFullName === upstreamFullName
        })
        if (linkedRemote) return

        const attemptKey = `${decodedPath}:${upstreamFullName}`
        if (upstreamLinkAttemptRef.current === attemptKey) return
        upstreamLinkAttemptRef.current = attemptKey

        const existingUpstreamRemote = (remotes || []).find((remote: any) => remote.name === 'upstream')

        void (async () => {
            try {
                const result = existingUpstreamRemote
                    ? await window.devscope.setRemoteUrl(decodedPath, 'upstream', upstreamCloneUrl)
                    : await window.devscope.addRemote(decodedPath, 'upstream', upstreamCloneUrl)
                if (!result?.success) {
                    throw new Error(result?.error || 'Failed to link upstream remote.')
                }
                invalidateProjectGitOverview(decodedPath)
                refreshLinkedUpstreamInBackground()
            } catch (error) {
                console.error('[GitTab] Failed to link upstream remote automatically', error)
            }
        })()
    }, [decodedPath, githubPublishContext?.upstream?.cloneUrl, githubPublishContext?.upstream?.fullName, refreshLinkedUpstreamInBackground, remotes, repoUsesForkOrigin])

    const ensureUpstreamRemote = async () => {
        if (effectiveUpstreamRemoteName) {
            return effectiveUpstreamRemoteName
        }

        const upstreamCloneUrl = githubPublishContext?.upstream?.cloneUrl
        const upstreamFullName = githubPublishContext?.upstream?.fullName
        if (!repoUsesForkOrigin || !upstreamCloneUrl || !decodedPath) {
            return null
        }

        const existingUpstreamRemote = (remotes || []).find((remote: any) => remote.name === 'upstream')
        if (existingUpstreamRemote) {
            const existingFullName = parseGitHubRemoteFullName(String(existingUpstreamRemote.pushUrl || existingUpstreamRemote.fetchUrl || ''))
            if (upstreamFullName && existingFullName !== upstreamFullName) {
                const updateResult = await window.devscope.setRemoteUrl(decodedPath, 'upstream', upstreamCloneUrl)
                if (!updateResult?.success) {
                    throw new Error(updateResult?.error || 'Failed to update upstream remote.')
                }
                invalidateProjectGitOverview(decodedPath)
                refreshLinkedUpstreamInBackground()
            }
            return 'upstream'
        }

        const addResult = await window.devscope.addRemote(decodedPath, 'upstream', upstreamCloneUrl)
        if (!addResult?.success) {
            throw new Error(addResult?.error || 'Failed to add upstream remote.')
        }

        invalidateProjectGitOverview(decodedPath)
        refreshLinkedUpstreamInBackground()
        return 'upstream'
    }

    const handleFetchOrigin = async () => {
        if (!originRemote?.name) return
        setActiveFetchTarget('origin')
        try {
            await handleFetch(originRemote.name, `Fetched ${originRemote.name}.`)
        } finally {
            setActiveFetchTarget(null)
        }
    }

    const handleFetchUpstream = async () => {
        setActiveFetchTarget('upstream')
        try {
            const remoteName = await ensureUpstreamRemote()
            if (!remoteName) {
                throw new Error('No upstream remote is configured for this repository.')
            }
            await handleFetch(remoteName, `Fetched ${remoteName}.`)
        } catch (error: any) {
            showToast(`Failed to fetch upstream: ${error.message}`, undefined, undefined, 'error')
        } finally {
            setActiveFetchTarget(null)
        }
    }

    const handlePullFromOrigin = async () => {
        if (!originRemote?.name) return
        setActiveUpdateTarget('origin')
        try {
            await handlePull({
                remoteName: originRemote.name,
                branchName: currentBranch,
                successLabel: `Updated ${currentBranch || 'current branch'} from ${originRemote.name}.`
            })
        } finally {
            setActiveUpdateTarget(null)
        }
    }

    const handleSyncFromUpstream = async () => {
        setActiveUpdateTarget('upstream')
        try {
            const upstreamRemoteName = await ensureUpstreamRemote()
            if (!upstreamRemoteName || !originRemote?.name) {
                throw new Error('Origin and upstream remotes must both be configured.')
            }

            await handlePull({
                remoteName: upstreamRemoteName,
                branchName: currentBranch,
                pushRemoteName: originRemote.name,
                successLabel: `Synced ${currentBranch || 'current branch'} from ${upstreamRemoteName} to ${originRemote.name}.`
            })
        } catch (error: any) {
            showToast(`Failed to sync upstream: ${error.message}`, undefined, undefined, 'error')
        } finally {
            setActiveUpdateTarget(null)
        }
    }

    const originRemoteUrl = String(originRemote?.pushUrl || originRemote?.fetchUrl || '')
    const upstreamRemoteUrl = repoUsesForkOrigin ? String(githubPublishContext?.upstream?.cloneUrl || '') : ''
    const repoFlowSummary = repoUsesForkOrigin
        ? `${originRepoDisplay} -> ${upstreamRepoDisplay}`
        : `${originRepoDisplay} -> ${gitSyncStatus?.upstreamBranch || 'tracked branch'}`

    const handleCopyRepoValue = async (value: string, label: string) => {
        const trimmed = String(value || '').trim()
        if (!trimmed) return
        const result = await window.devscope.copyToClipboard(trimmed)
        if (result?.success) {
            showToast(`${label} copied.`)
            return
        }
        showToast(`Failed to copy ${label.toLowerCase()}.`, undefined, undefined, 'error')
    }

    return {
        githubPublishContext,
        loadingGitHubPublishContext,
        gitHubPublishContextError,
        refreshGitHubPublishContext,
        hasGitHubRemote,
        repoUsesForkOrigin,
        originRepoDisplay,
        upstreamRepoDisplay,
        canFetchOrigin,
        showFetchUpstreamButton,
        canSyncFromUpstream,
        pushAccessIndicator,
        compactPushSummaryLines,
        currentBranchNeedsPublish,
        showPushAction,
        visibleHistorySource,
        visibleHistoryCommits,
        effectiveHistoryTotalCount,
        totalHistoryPages,
        unpushedStatsLoading,
        incomingStatsLoading,
        historyLoading,
        shouldHighlightPull,
        pullStatusItems,
        pagedIncomingCommits,
        localOnlyCommitHashes,
        activeFetchTarget,
        activeUpdateTarget,
        remoteHeadCommitHash,
        handleNextHistoryPage,
        handleFetchOrigin,
        handleFetchUpstream,
        handlePullFromOrigin,
        handleSyncFromUpstream,
        originRemoteUrl,
        upstreamRemoteUrl,
        repoFlowSummary,
        ensureUpstreamRemote,
        handleCopyRepoValue
    }
}
