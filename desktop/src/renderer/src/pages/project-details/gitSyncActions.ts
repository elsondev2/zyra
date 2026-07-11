import { buildGitPublishPlan, describeGitPublishSuccess, type GitPublishPlan } from '@/lib/gitPublishPlanner'
import { invalidateProjectGitOverview } from '@/lib/projectGitOverview'
import type { GitActionParams } from './gitActionTypes'
import { isNonFastForwardPushError, isTransientPushError, summarizePushError } from './gitActionHelpers'
import { readStoredProjectGitActivity, writeStoredProjectGitActivity } from './projectDetailsPageHelpers'
import { refreshGitInBackground } from './gitActionRefresh'

export function createGitSyncActions(params: GitActionParams) {
    const handlePush = async (
        publishPlanOverride?: GitPublishPlan,
        options?: { commitHash?: string; commitMessage?: string },
        pushOptions?: { remoteName?: string; branchName?: string }
    ) => {
        if (!params.decodedPath) return
        const targetCommitHash = String(options?.commitHash || '').trim()
        const publishPlan = publishPlanOverride ?? buildGitPublishPlan({
            currentBranch: params.currentBranch,
            branches: params.branches,
            remotes: params.remotes,
            unpushedCommits: params.unpushedCommits,
            selectedCommitHash: targetCommitHash || undefined,
            intent: targetCommitHash ? 'push-range' : 'push-all'
        })

        params.setIsPushing(true)
        try {
            let retriedAfterTransientError = false
            const runPush = async () => {
                const pushResult = targetCommitHash
                    ? await window.devscope.pushSingleCommit(params.decodedPath, targetCommitHash, pushOptions)
                    : await window.devscope.pushCommits(params.decodedPath, pushOptions)
                if (!pushResult?.success) {
                    throw new Error(pushResult?.error || (targetCommitHash ? 'Failed to push selected commit' : 'Failed to push commits'))
                }
            }

            try {
                await runPush()
            } catch (initialError: any) {
                const initialMessage = String(initialError?.message || initialError || '')
                if (!isTransientPushError(initialMessage)) {
                    throw initialError
                }

                params.showToast('Push interrupted by network timeout. Retrying once...')
                await new Promise((resolve) => setTimeout(resolve, 1200))
                await runPush()
                retriedAfterTransientError = true
                params.showToast('Push succeeded after retry.')
            }

            invalidateProjectGitOverview(params.decodedPath)
            if (!retriedAfterTransientError) {
                params.showToast(describeGitPublishSuccess(
                    publishPlan,
                    { commitHash: targetCommitHash || undefined, currentBranch: params.currentBranch }
                ))
            }
            params.setIsPushing(false)
            refreshGitInBackground(params, false, 'unpushed')
        } catch (err: any) {
            const rawMessage = String(err?.message || err || 'Failed to push commits')
            if (isNonFastForwardPushError(rawMessage)) {
                invalidateProjectGitOverview(params.decodedPath)
                refreshGitInBackground(params, false, 'unpushed')
            }
            params.showToast(`Failed to push: ${summarizePushError(rawMessage)}`, undefined, undefined, 'error')
        } finally {
            params.setIsPushing(false)
        }
    }

    return {
        handleFetch: async (remoteName?: string, successLabel?: string) => {
            if (!params.decodedPath) return

            params.setIsFetching(true)
            try {
                const result = await window.devscope.fetchUpdates(params.decodedPath, remoteName)
                if (!result?.success) {
                    throw new Error(result?.error || 'Failed to fetch updates')
                }

                const lastFetched = Date.now()
                params.setLastFetched(lastFetched)
                writeStoredProjectGitActivity(params.decodedPath, {
                    ...readStoredProjectGitActivity(params.decodedPath),
                    lastFetched
                })
                invalidateProjectGitOverview(params.decodedPath)
                params.showToast(successLabel || (remoteName ? `Fetched ${remoteName}.` : 'Fetched remote updates.'))
                params.setIsFetching(false)
                refreshGitInBackground(params, false, 'pulls')
            } catch (err: any) {
                params.showToast(`Failed to fetch: ${err.message}`, undefined, undefined, 'error')
            } finally {
                params.setIsFetching(false)
            }
        },
        handlePush,
        handlePull: async (options?: { remoteName?: string; branchName?: string; pushRemoteName?: string; successLabel?: string }) => {
            if (!params.decodedPath) return

            params.setIsPulling(true)
            try {
                const result = await window.devscope.pullUpdates(params.decodedPath, options)
                if (!result?.success) {
                    throw new Error(result?.error || 'Failed to pull updates')
                }

                const lastPulled = Date.now()
                params.setLastPulled(lastPulled)
                writeStoredProjectGitActivity(params.decodedPath, {
                    ...readStoredProjectGitActivity(params.decodedPath),
                    lastPulled
                })
                invalidateProjectGitOverview(params.decodedPath)
                params.showToast(options?.successLabel || 'Pulled remote updates successfully.')
                params.setIsPulling(false)
                refreshGitInBackground(params, true, 'pulls')
            } catch (err: any) {
                params.showToast(`Failed to pull: ${err.message}`, undefined, undefined, 'error')
            } finally {
                params.setIsPulling(false)
            }
        },
        handleSwitchBranch: async () => {
            if (!params.decodedPath || !params.targetBranch || params.targetBranch === params.currentBranch) return

            params.setIsSwitchingBranch(true)
            try {
                const checkoutResult = await window.devscope.checkoutBranch(params.decodedPath, params.targetBranch, {
                    autoStash: true,
                    autoCleanupLock: true
                })
                if (!checkoutResult?.success) {
                    throw new Error(checkoutResult?.error || 'Failed to switch branch')
                }

                invalidateProjectGitOverview(params.decodedPath)
                if (checkoutResult?.cleanedLock && checkoutResult?.stashed) {
                    params.showToast(`Recovered stale Git lock and auto-stashed changes (${checkoutResult.stashRef || 'stash@{0}'}).`)
                } else if (checkoutResult?.cleanedLock) {
                    params.showToast('Recovered stale Git lock and switched branch.')
                } else if (checkoutResult?.stashed) {
                    params.showToast(`Switched branch after auto-stashing local changes (${checkoutResult.stashRef || 'stash@{0}'}).`)
                }
                params.setIsSwitchingBranch(false)
                refreshGitInBackground(params, true, 'full')
            } catch (err: any) {
                params.showToast(`Failed to switch branch: ${err.message}`, undefined, undefined, 'error')
            } finally {
                params.setIsSwitchingBranch(false)
            }
        }
    }
}
