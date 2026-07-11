import type { GitActionParams, RefreshGitOptions } from './gitActionTypes'

export function refreshGitInBackground(
    params: Pick<GitActionParams, 'refreshGitData'>,
    refreshFilesToo: boolean,
    mode: NonNullable<RefreshGitOptions['mode']>
): void {
    void params.refreshGitData(refreshFilesToo, { mode, quiet: true }).catch((error: any) => {
        console.error('[GitActions] Background git refresh failed', error)
    })
}
