import { createGit, getRepoContext } from '../inspectors/git/core'
import { pushCommits } from '../inspectors/git/write'
import { getGitHubPublishContext } from './github-publish'
import {
    parseGitHubRemoteRef,
    parseGitHubRepositoryNameWithOwnerFromRemoteUrl,
    parseGitHubRepositoryOwnerLogin
} from './github-remote'
import { resolveDefaultBranch } from './github-pull-request-gh'
import type { BranchHeadContext, BranchState } from './github-pull-request-types'

function appendUnique(values: string[], next: string | null | undefined) {
    const normalized = String(next || '').trim()
    if (!normalized || values.includes(normalized)) return
    values.push(normalized)
}

export function parseUpstreamRef(upstreamRef: string | null | undefined): { remoteName: string; branchName: string } | null {
    const normalized = String(upstreamRef || '').trim()
    if (!normalized || !normalized.includes('/')) return null

    if (normalized.startsWith('refs/remotes/')) {
        const remainder = normalized.slice('refs/remotes/'.length)
        const slashIndex = remainder.indexOf('/')
        if (slashIndex < 0) return null
        const remoteName = remainder.slice(0, slashIndex).trim()
        const branchName = remainder.slice(slashIndex + 1).trim()
        return remoteName && branchName ? { remoteName, branchName } : null
    }

    const [remoteName, ...branchParts] = normalized.split('/')
    const branchName = branchParts.join('/').trim()
    return remoteName && branchName ? { remoteName, branchName } : null
}

export async function resolveRepoCwd(projectPath: string) {
    const git = createGit(projectPath)
    const repoContext = await getRepoContext(git, projectPath)
    return repoContext.repoRoot
}

export async function readBranchState(projectPath: string): Promise<BranchState> {
    const cwd = await resolveRepoCwd(projectPath)
    const git = createGit(cwd)
    const [branchRaw, workingTreeRaw, upstreamRefRaw, aheadBehindRaw, remotes] = await Promise.all([
        git.raw(['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => 'HEAD'),
        git.raw(['status', '--porcelain=v1']).catch(() => ''),
        git.raw(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).catch(() => ''),
        git.raw(['rev-list', '--left-right', '--count', 'HEAD...@{u}']).catch(() => ''),
        git.getRemotes(true).catch(() => [])
    ])

    const branch = String(branchRaw || '').trim() || null
    const upstreamRef = String(upstreamRefRaw || '').trim() || null
    const workingTreeLines = String(workingTreeRaw || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    const [aheadText, behindText] = String(aheadBehindRaw || '').trim().split(/\s+/)

    return {
        cwd,
        branch,
        detached: branch === 'HEAD' || !branch,
        hasWorkingTreeChanges: workingTreeLines.length > 0,
        upstreamRef,
        ahead: Number.isNaN(Number.parseInt(aheadText || '0', 10)) ? 0 : Number.parseInt(aheadText || '0', 10),
        behind: Number.isNaN(Number.parseInt(behindText || '0', 10)) ? 0 : Number.parseInt(behindText || '0', 10),
        remotes: remotes.map((remote) => ({
            name: remote.name,
            fetchUrl: String(remote.refs?.fetch || '').trim(),
            pushUrl: String(remote.refs?.push || '').trim()
        }))
    }
}

export function getPreferredGitHubRemote(remotes: Array<{ name: string; fetchUrl: string; pushUrl: string }>) {
    return remotes.find((remote) => remote.name === 'origin' && parseGitHubRemoteRef(remote.pushUrl || remote.fetchUrl))
        ?? remotes.find((remote) => parseGitHubRemoteRef(remote.pushUrl || remote.fetchUrl))
        ?? null
}

export async function resolveBranchHeadContext(projectPath: string, branchState: BranchState): Promise<BranchHeadContext> {
    const branch = String(branchState.branch || '').trim()
    if (!branch || branchState.detached) {
        throw new Error('Cannot resolve a pull request branch from detached HEAD.')
    }

    const upstream = parseUpstreamRef(branchState.upstreamRef)
    const trackedRemoteName = upstream?.remoteName ?? null
    const trackedRemoteBranch = upstream?.branchName || branch
    const trackedRemote = trackedRemoteName
        ? branchState.remotes.find((remote) => remote.name === trackedRemoteName) || null
        : null
    const trackedRepositoryNameWithOwner = parseGitHubRepositoryNameWithOwnerFromRemoteUrl(trackedRemote?.pushUrl || trackedRemote?.fetchUrl)
    const trackedOwnerLogin = parseGitHubRepositoryOwnerLogin(trackedRepositoryNameWithOwner)

    const publishContext = await getGitHubPublishContext(projectPath).catch(() => null)
    const upstreamFullName = publishContext?.upstream?.fullName || null
    const isCrossRepository = Boolean(
        trackedRepositoryNameWithOwner
        && upstreamFullName
        && trackedRepositoryNameWithOwner !== upstreamFullName
    )

    const headSelectors: string[] = []
    const ownerQualifiedSelector = isCrossRepository && trackedOwnerLogin
        ? `${trackedOwnerLogin}:${trackedRemoteBranch}`
        : trackedRemoteBranch
    appendUnique(headSelectors, ownerQualifiedSelector)
    appendUnique(headSelectors, trackedRemoteName ? `${trackedRemoteName}:${trackedRemoteBranch}` : null)
    appendUnique(headSelectors, branch)
    appendUnique(headSelectors, trackedRemoteBranch !== branch ? trackedRemoteBranch : null)

    return {
        headBranch: trackedRemoteBranch,
        headSelectors,
        preferredHeadSelector: ownerQualifiedSelector,
        remoteName: trackedRemoteName,
        headRepositoryNameWithOwner: trackedRepositoryNameWithOwner,
        headRepositoryOwnerLogin: trackedOwnerLogin,
        isCrossRepository
    }
}

export async function resolveBaseBranch(
    cwd: string,
    branch: string,
    upstreamRef: string | null,
    isCrossRepository: boolean,
    preferredBaseBranch?: string | null
) {
    const normalizedPreferred = String(preferredBaseBranch || '').trim()
    if (normalizedPreferred) {
        return normalizedPreferred
    }

    const git = createGit(cwd)
    const configured = String(await git.raw(['config', '--get', `branch.${branch}.gh-merge-base`]).catch(() => '')).trim()
    if (configured) return configured

    const upstream = parseUpstreamRef(upstreamRef)
    if (upstream && !isCrossRepository && upstream.branchName && upstream.branchName !== branch) {
        return upstream.branchName
    }

    return await resolveDefaultBranch(cwd).catch(() => 'main')
}

export async function ensureNoWorkingTreeChanges(branchState: BranchState) {
    if (branchState.detached) {
        throw new Error('Detached HEAD: checkout a branch before creating a PR.')
    }
    if (branchState.hasWorkingTreeChanges) {
        throw new Error('Commit local changes before creating a PR.')
    }
    if (branchState.behind > 0 && branchState.ahead > 0) {
        throw new Error('Branch has diverged from upstream. Rebase or merge before creating a PR.')
    }
    if (branchState.behind > 0) {
        throw new Error('Branch is behind upstream. Pull or rebase before creating a PR.')
    }
}

export async function pushCurrentBranchIfNeeded(projectPath: string, branchState: BranchState) {
    const preferredRemote = getPreferredGitHubRemote(branchState.remotes)
    if (!preferredRemote) {
        throw new Error('Add a GitHub remote before creating a PR.')
    }

    const branch = String(branchState.branch || '').trim()
    if (!branch) {
        throw new Error('Detached HEAD: checkout a branch before creating a PR.')
    }

    if (!branchState.upstreamRef || branchState.ahead > 0) {
        const upstream = parseUpstreamRef(branchState.upstreamRef)
        await pushCommits(branchState.cwd, {
            remoteName: upstream?.remoteName || preferredRemote.name,
            branchName: branch
        })
    }
}
