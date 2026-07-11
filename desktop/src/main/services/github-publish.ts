import log from 'electron-log'
import { listRemotes } from '../inspectors/git'
import type {
    DevScopeGitHubPublishContext,
    DevScopeGitHubRepository
} from '../../shared/contracts/devscope-git-contracts'
import { parseGitHubRemoteRef, toRepository, type GitHubRepoRef } from './github-remote'

type GitHubApiRepository = {
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
}

const GITHUB_API_ROOT = 'https://api.github.com'
const GITHUB_API_VERSION = '2022-11-28'
const GITHUB_USER_AGENT = 'Zyra-Agent'


async function githubRequest<T>(path: string): Promise<T> {
    const response = await fetch(`${GITHUB_API_ROOT}${path}`, {
        headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': GITHUB_API_VERSION,
            'User-Agent': GITHUB_USER_AGENT
        }
    })

    const text = await response.text()
    const parsed = text ? JSON.parse(text) : null
    if (!response.ok) {
        const message = typeof parsed?.message === 'string' ? parsed.message : `GitHub API request failed (${response.status})`
        throw new Error(message)
    }

    return parsed as T
}

async function getRepository(repoRef: GitHubRepoRef): Promise<DevScopeGitHubRepository> {
    const response = await githubRequest<GitHubApiRepository>(repoRef.apiPath)
    return toRepository(response)
}

async function getRepositoryByFullName(fullName: string): Promise<DevScopeGitHubRepository> {
    const normalized = String(fullName || '').trim()
    const [owner = '', repo = ''] = normalized.split('/')
    if (!owner || !repo) {
        throw new Error(`Invalid GitHub repository name: ${fullName}`)
    }

    return getRepository({
        owner,
        repo,
        fullName: normalized,
        htmlUrl: `https://github.com/${owner}/${repo}`,
        apiPath: `/repos/${owner}/${repo}`
    })
}

function findMatchingRemoteName(remotes: Array<{ name: string; pushUrl: string }>, fullName: string): string | null {
    for (const remote of remotes) {
        const ref = parseGitHubRemoteRef(remote.pushUrl)
        if (ref?.fullName === fullName) {
            return remote.name
        }
    }
    return null
}

export async function getGitHubPublishContext(projectPath: string): Promise<DevScopeGitHubPublishContext> {
    const remotes = await listRemotes(projectPath)
    const githubRemotes = remotes
        .map((remote) => ({
            ...remote,
            repoRef: parseGitHubRemoteRef(remote.pushUrl)
        }))
        .filter((remote): remote is { name: string; fetchUrl: string; pushUrl: string; repoRef: GitHubRepoRef } => Boolean(remote.repoRef))

    const preferredRemote = githubRemotes.find((remote) => remote.name === 'origin')
        ?? githubRemotes[0]
        ?? null

    if (!preferredRemote) {
        return {
            isGitHubRemote: false,
            remoteName: null,
            canOpenPullRequest: false,
            summaryLines: ["Add a GitHub remote before using Zyra pull request creation."]
        }
    }

    try {
        const currentRemoteRepository = await getRepository(preferredRemote.repoRef)
        const upstream = currentRemoteRepository.isFork && currentRemoteRepository.parentFullName
            ? await getRepositoryByFullName(currentRemoteRepository.parentFullName)
            : currentRemoteRepository
        const upstreamRemoteName = findMatchingRemoteName(remotes, upstream.fullName)
        const repoUsesForkOrigin = Boolean(
            currentRemoteRepository.isFork
            && currentRemoteRepository.parentFullName
            && currentRemoteRepository.fullName !== upstream.fullName
        )

        return {
            isGitHubRemote: true,
            remoteName: upstreamRemoteName || preferredRemote.name,
            upstream,
            canOpenPullRequest: true,
            summaryLines: repoUsesForkOrigin
                ? [
                    `Origin points to fork ${currentRemoteRepository.fullName}.`,
                    `Pull requests draft against upstream ${upstream.fullName}.`
                ]
                : [`Pull requests draft against ${upstream.fullName}.`]
        }
    } catch (err: any) {
        log.warn('[GitHub] Falling back to remote-only PR context:', err)
        return {
            isGitHubRemote: true,
            remoteName: preferredRemote.name,
            canOpenPullRequest: true,
            summaryLines: [`Pull requests draft against ${preferredRemote.repoRef.fullName}.`]
        }
    }
}
