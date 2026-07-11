import type { DevScopeGitHubRepository } from '../../shared/contracts/devscope-git-contracts'

export type GitHubRepoRef = {
    owner: string
    repo: string
    fullName: string
    htmlUrl: string
    apiPath: string
}

export function parseGitHubRemoteRef(remoteUrl: string): GitHubRepoRef | null {
    const trimmed = String(remoteUrl || '').trim()
    if (!trimmed) return null

    const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i)
    if (sshMatch) {
        const owner = sshMatch[1]
        const repo = sshMatch[2].replace(/\.git$/i, '')
        return {
            owner,
            repo,
            fullName: `${owner}/${repo}`,
            htmlUrl: `https://github.com/${owner}/${repo}`,
            apiPath: `/repos/${owner}/${repo}`
        }
    }

    try {
        const url = new URL(trimmed)
        if (!/github\.com$/i.test(url.hostname)) return null
        const segments = url.pathname.split('/').filter(Boolean)
        if (segments.length < 2) return null
        const owner = segments[0]
        const repo = segments[1].replace(/\.git$/i, '')
        return {
            owner,
            repo,
            fullName: `${owner}/${repo}`,
            htmlUrl: `https://github.com/${owner}/${repo}`,
            apiPath: `/repos/${owner}/${repo}`
        }
    } catch {
        return null
    }
}

export function parseGitHubRepositoryNameWithOwnerFromRemoteUrl(remoteUrl: string | null | undefined): string | null {
    return parseGitHubRemoteRef(String(remoteUrl || ''))?.fullName || null
}

export function parseGitHubRepositoryOwnerLogin(nameWithOwner: string | null | undefined): string | null {
    const normalized = String(nameWithOwner || '').trim()
    if (!normalized) return null
    const [owner = ''] = normalized.split('/')
    return owner.trim() || null
}

export function toRepository(repo: {
    name: string
    full_name: string
    html_url: string
    clone_url: string
    ssh_url: string
    default_branch?: string
    private?: boolean
    fork?: boolean
    parent?: { full_name?: string | null } | null
    permissions?: {
        admin?: boolean
        maintain?: boolean
        push?: boolean
        triage?: boolean
        pull?: boolean
    }
}): DevScopeGitHubRepository {
    const [owner = '', name = ''] = String(repo.full_name || '').split('/')
    return {
        owner,
        repo: name,
        fullName: repo.full_name,
        htmlUrl: repo.html_url,
        cloneUrl: repo.clone_url,
        sshUrl: repo.ssh_url,
        defaultBranch: repo.default_branch,
        private: repo.private !== false,
        isFork: repo.fork === true,
        parentFullName: repo.parent?.full_name || null,
        permissions: repo.permissions
            ? {
                admin: repo.permissions.admin === true,
                maintain: repo.permissions.maintain === true,
                push: repo.permissions.push === true,
                triage: repo.permissions.triage === true,
                pull: repo.permissions.pull !== false
            }
            : undefined
    }
}
