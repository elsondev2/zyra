import { execFile as execFileCallback } from 'child_process'
import { randomUUID } from 'node:crypto'
import { unlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import { getAugmentedEnv } from '../inspectors/safe-exec'
import { parseGitHubRepositoryOwnerLogin } from './github-remote'
import type { CreatePullRequestRequest, PullRequestInfo, PullRequestState } from './github-pull-request-types'

const execFileAsync = promisify(execFileCallback)
const GH_TIMEOUT_MS = 30_000
const GITHUB_PULL_REQUEST_JSON_FIELDS = 'number,title,url,baseRefName,headRefName,state,mergedAt,updatedAt,isCrossRepository,headRepository,headRepositoryOwner'

export async function runGh(cwd: string, args: string[]) {
    try {
        const result = await execFileAsync('gh', args, {
            cwd,
            timeout: GH_TIMEOUT_MS,
            windowsHide: true,
            maxBuffer: 1024 * 1024,
            env: getAugmentedEnv()
        })
        return {
            stdout: String(result.stdout || ''),
            stderr: String(result.stderr || '')
        }
    } catch (error: any) {
        const message = String(error?.stderr || error?.stdout || error?.message || '').trim()
        const lower = message.toLowerCase()

        if (error?.code === 'ENOENT') {
            throw new Error('GitHub CLI (`gh`) is required but was not found on PATH.')
        }
        if (
            lower.includes('not logged in')
            || lower.includes('gh auth login')
            || lower.includes('authentication failed')
            || lower.includes('no oauth token')
        ) {
            throw new Error('GitHub CLI is not authenticated. Run `gh auth login` and retry.')
        }
        if (
            lower.includes('could not resolve to a pullrequest')
            || lower.includes('pull request not found')
            || lower.includes('no pull requests found for branch')
        ) {
            throw new Error('Pull request not found for the current branch.')
        }

        throw new Error(message || 'GitHub CLI command failed.')
    }
}

function normalizePullRequestState(input: { state?: string | null; mergedAt?: string | null }): PullRequestState {
    if ((input.mergedAt || '').trim()) return 'merged'
    if (input.state === 'CLOSED' || input.state === 'closed') return 'closed'
    return 'open'
}

function toPullRequestSummary(entry: any): PullRequestInfo | null {
    if (!entry || typeof entry !== 'object') return null
    const number = Number(entry.number)
    const title = String(entry.title || '').trim()
    const url = String(entry.url || '').trim()
    const baseBranch = String(entry.baseRefName || '').trim()
    const headBranch = String(entry.headRefName || '').trim()
    if (!Number.isInteger(number) || number <= 0 || !title || !url || !baseBranch || !headBranch) {
        return null
    }

    const headRepositoryNameWithOwner = typeof entry.headRepository?.nameWithOwner === 'string'
        ? String(entry.headRepository.nameWithOwner).trim()
        : null
    const headRepositoryOwnerLogin = typeof entry.headRepositoryOwner?.login === 'string'
        ? String(entry.headRepositoryOwner.login).trim()
        : parseGitHubRepositoryOwnerLogin(headRepositoryNameWithOwner)

    return {
        number,
        title,
        url,
        baseBranch,
        headBranch,
        state: normalizePullRequestState({ state: entry.state, mergedAt: entry.mergedAt }),
        updatedAt: typeof entry.updatedAt === 'string' && entry.updatedAt.trim() ? entry.updatedAt.trim() : null,
        ...(typeof entry.isCrossRepository === 'boolean' ? { isCrossRepository: entry.isCrossRepository } : {}),
        ...(headRepositoryNameWithOwner ? { headRepositoryNameWithOwner } : {}),
        ...(headRepositoryOwnerLogin ? { headRepositoryOwnerLogin } : {})
    }
}

function parsePullRequestList(raw: string): PullRequestInfo[] {
    if (!raw.trim()) return []
    try {
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed
            .map((entry) => toPullRequestSummary(entry))
            .filter((entry): entry is PullRequestInfo => Boolean(entry))
    } catch {
        return []
    }
}

async function listPullRequests(cwd: string, headSelector: string, state: 'open' | 'all') {
    const result = await runGh(cwd, [
        'pr',
        'list',
        '--head',
        headSelector,
        '--state',
        state,
        '--limit',
        '20',
        '--json',
        GITHUB_PULL_REQUEST_JSON_FIELDS
    ])
    return parsePullRequestList(result.stdout)
}

export async function findOpenPullRequest(cwd: string, headSelectors: string[]) {
    for (const headSelector of headSelectors) {
        const matches = await listPullRequests(cwd, headSelector, 'open').catch(() => [])
        if (matches[0]) {
            return matches[0]
        }
    }
    return null
}

export async function findLatestPullRequest(cwd: string, headSelectors: string[]) {
    const byNumber = new Map<number, PullRequestInfo>()
    for (const headSelector of headSelectors) {
        const matches = await listPullRequests(cwd, headSelector, 'all').catch(() => [])
        for (const match of matches) {
            byNumber.set(match.number, match)
        }
    }

    const parsed = Array.from(byNumber.values()).sort((left, right) => {
        const leftTime = left.updatedAt ? Date.parse(left.updatedAt) : 0
        const rightTime = right.updatedAt ? Date.parse(right.updatedAt) : 0
        return rightTime - leftTime
    })
    return parsed.find((entry) => entry.state === 'open') || parsed[0] || null
}

export async function resolveDefaultBranch(cwd: string) {
    const result = await runGh(cwd, ['repo', 'view', '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name'])
    const branch = String(result.stdout || '').trim()
    return branch || 'main'
}

export async function createPullRequest(cwd: string, input: CreatePullRequestRequest) {
    const bodyFile = join(tmpdir(), `devscope-pr-body-${process.pid}-${randomUUID()}.md`)
    await writeFile(bodyFile, input.body, 'utf8')
    try {
        const result = await runGh(cwd, [
            'pr',
            'create',
            '--base',
            input.baseBranch,
            '--head',
            input.headSelector,
            '--title',
            input.title,
            '--body-file',
            bodyFile,
            ...(input.draft ? ['--draft'] : [])
        ])
        return result.stdout.trim()
    } finally {
        await unlink(bodyFile).catch(() => undefined)
    }
}
