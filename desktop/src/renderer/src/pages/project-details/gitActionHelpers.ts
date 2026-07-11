import type { FileTreeNode, GitStatusDetail } from './types'

const PUSH_TRANSIENT_ERROR_PATTERNS: RegExp[] = [
    /\bHTTP\s*408\b/i,
    /\bcurl\s*22\b.*\b408\b/i,
    /\bRPC failed\b/i,
    /\bunexpected disconnect\b/i,
    /\bremote end hung up unexpectedly\b/i,
    /\bsideband packet\b/i,
    /\btimed out\b/i
]

export function isTransientPushError(message: string): boolean {
    return PUSH_TRANSIENT_ERROR_PATTERNS.some((pattern) => pattern.test(message))
}

export function isNonFastForwardPushError(rawMessage: string): boolean {
    const message = String(rawMessage || '').trim()
    if (!message) return false

    return (
        /\bnon-fast-forward\b/i.test(message)
        || /\bfetch first\b/i.test(message)
        || /\[rejected\]\s+\(fetch first\)/i.test(message)
        || /\bbranch is behind upstream\b/i.test(message)
        || /\bhas new commits\b/i.test(message)
    )
}

export function summarizePushError(rawMessage: string): string {
    const message = String(rawMessage || '').trim()
    const compact = message.replace(/\s+/g, ' ')

    if (/\bHTTP\s*408\b/i.test(message) || /\bcurl\s*22\b.*\b408\b/i.test(message)) {
        return 'Push timed out (HTTP 408). Retry push. If it keeps failing, check network/VPN/proxy or remote status.'
    }
    if (isTransientPushError(message)) {
        return 'Push connection dropped while uploading pack data. Retry push; if it repeats, verify network stability and remote availability.'
    }
    if (/\bAuthentication failed\b/i.test(message) || /\b403\b/.test(message) || /\b401\b/.test(message)) {
        return 'Push was rejected by remote authentication. Re-authenticate Git credentials/token and retry.'
    }
    if (isNonFastForwardPushError(message) || /\brejected\b/i.test(message)) {
        return 'Push rejected (non-fast-forward). Pull/rebase the latest remote changes, then push again.'
    }

    return compact || 'Failed to push commits'
}

export function normalizePath(path: string): string {
    return path.replace(/\\/g, '/').trim()
}

export function buildStatusMap(details: GitStatusDetail[]): Record<string, FileTreeNode['gitStatus']> {
    const statusMap: Record<string, FileTreeNode['gitStatus']> = {}
    for (const detail of details) {
        statusMap[detail.path] = detail.status
        statusMap[detail.path.replace(/\//g, '\\')] = detail.status
        if (detail.previousPath) {
            statusMap[detail.previousPath] = 'renamed'
            statusMap[detail.previousPath.replace(/\//g, '\\')] = 'renamed'
        }
    }
    return statusMap
}

export function pathMatchesDetail(detail: GitStatusDetail, targetPath: string): boolean {
    return normalizePath(detail.path) === normalizePath(targetPath)
}

export function toStagedDetail(detail: GitStatusDetail): GitStatusDetail {
    const nextStagedAdditions = detail.stagedAdditions + detail.unstagedAdditions
    const nextStagedDeletions = detail.stagedDeletions + detail.unstagedDeletions
    return {
        ...detail,
        status: detail.status === 'untracked' ? 'added' : detail.status,
        staged: true,
        unstaged: false,
        additions: nextStagedAdditions,
        deletions: nextStagedDeletions,
        stagedAdditions: nextStagedAdditions,
        stagedDeletions: nextStagedDeletions,
        unstagedAdditions: 0,
        unstagedDeletions: 0,
        statsLoaded: detail.statsLoaded
    }
}

export function toUnstagedDetail(detail: GitStatusDetail): GitStatusDetail {
    const nextUnstagedAdditions = detail.stagedAdditions + detail.unstagedAdditions
    const nextUnstagedDeletions = detail.stagedDeletions + detail.unstagedDeletions
    return {
        ...detail,
        status: detail.status === 'added' ? 'untracked' : detail.status,
        staged: false,
        unstaged: true,
        additions: nextUnstagedAdditions,
        deletions: nextUnstagedDeletions,
        stagedAdditions: 0,
        stagedDeletions: 0,
        unstagedAdditions: nextUnstagedAdditions,
        unstagedDeletions: nextUnstagedDeletions,
        statsLoaded: detail.statsLoaded
    }
}

export function toStagedOnlyDetail(detail: GitStatusDetail): GitStatusDetail {
    const nextStagedAdditions = detail.stagedAdditions
    const nextStagedDeletions = detail.stagedDeletions
    return {
        ...detail,
        status: detail.status === 'untracked' ? 'added' : detail.status,
        staged: true,
        unstaged: false,
        additions: nextStagedAdditions,
        deletions: nextStagedDeletions,
        stagedAdditions: nextStagedAdditions,
        stagedDeletions: nextStagedDeletions,
        unstagedAdditions: 0,
        unstagedDeletions: 0,
        statsLoaded: detail.statsLoaded
    }
}
