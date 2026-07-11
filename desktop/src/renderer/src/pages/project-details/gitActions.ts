import type { GitStatusDetail } from './types'
import type { GitActionParams } from './gitActionTypes'
import { buildStatusMap } from './gitActionHelpers'
import { createGitWorkingTreeActions } from './gitWorkingTreeActions'
import { createGitCommitAndPullRequestActions } from './gitCommitAndPullRequestActions'
import { createGitProjectSetupActions } from './gitProjectSetupActions'
import { createGitSyncActions } from './gitSyncActions'

export function createProjectGitActions(params: GitActionParams) {
    const bulkActionScope = params.settings.gitBulkActionScope === 'project' ? 'project' : 'repo'

    const applyOptimisticDetails = (
        mutate: (prev: GitStatusDetail[]) => GitStatusDetail[]
    ): (() => void) => {
        let snapshot: GitStatusDetail[] = []
        params.setGitStatusDetails((prev) => {
            snapshot = prev
            const next = mutate(prev)
            params.setGitStatusMap(buildStatusMap(next))
            return next
        })

        return () => {
            params.setGitStatusDetails(snapshot)
            params.setGitStatusMap(buildStatusMap(snapshot))
        }
    }

    return {
        ...createGitWorkingTreeActions(params, bulkActionScope, applyOptimisticDetails),
        ...createGitCommitAndPullRequestActions(params),
        ...createGitSyncActions(params),
        ...createGitProjectSetupActions(params)
    }
}
