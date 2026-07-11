import log from 'electron-log'
import {
    countTrackedChanges,
    createGit,
    getRepoContext,
    normalizeGitPath,
    parseCommitLog,
    stripPathPrefix,
    toError,
    toErrorMessage
} from './core'
import type {
    GitCommit,
    GitFileStatus,
    GitStatusDetail,
    GitStatusMap,
    GitSyncStatus,
    ProjectGitOverview
} from './types'

export interface GitStatusDetailedOptions {
    includeStats?: boolean
}

export function applyStatusStats(
    target: {
        path: string
        additions: number
        deletions: number
        stagedAdditions: number
        stagedDeletions: number
        unstagedAdditions: number
        unstagedDeletions: number
        statsLoaded?: boolean
    },
    stagedNumstat: Map<string, { additions: number; deletions: number }>,
    unstagedNumstat: Map<string, { additions: number; deletions: number }>
) {
    const stagedStats = stagedNumstat.get(target.path) || { additions: 0, deletions: 0 }
    const unstagedStats = unstagedNumstat.get(target.path) || { additions: 0, deletions: 0 }
    target.additions = stagedStats.additions + unstagedStats.additions
    target.deletions = stagedStats.deletions + unstagedStats.deletions
    target.stagedAdditions = stagedStats.additions
    target.stagedDeletions = stagedStats.deletions
    target.unstagedAdditions = unstagedStats.additions
    target.unstagedDeletions = unstagedStats.deletions
    target.statsLoaded = true
}

function classifyGitStatus(code: string): GitFileStatus {
    if (code === '??') return 'untracked'
    if (code === '!!') return 'ignored'
    if (code.includes('R') || code.includes('C')) return 'renamed'
    if (code.includes('U')) return 'modified'
    if (code.includes('T')) return 'modified'
    if (code.includes('A')) return 'added'
    if (code.includes('D')) return 'deleted'
    if (code.includes('M')) return 'modified'
    return 'unknown'
}

function toStatusDetailMap(details: GitStatusDetail[]): GitStatusMap {
    const statusMap: GitStatusMap = {}
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

function toNumstatPath(pathText: string): string {
    const trimmed = normalizeGitPath(pathText).trim()
    if (!trimmed.includes(' => ')) return trimmed
    const rhs = trimmed.split(' => ').pop() || trimmed
    return rhs.replace(/[{}]/g, '').trim()
}

export function parseNumstat(stdout: string, projectRelativeToRepo: string): Map<string, { additions: number; deletions: number }> {
    const result = new Map<string, { additions: number; deletions: number }>()
    for (const rawLine of stdout.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line) continue
        const columns = line.split('\t')
        if (columns.length < 3) continue

        const additions = columns[0] === '-' ? 0 : Number.parseInt(columns[0], 10)
        const deletions = columns[1] === '-' ? 0 : Number.parseInt(columns[1], 10)
        const candidatePath = toNumstatPath(columns.slice(2).join('\t'))
        const path = stripPathPrefix(candidatePath, projectRelativeToRepo)
        if (!path) continue

        const prev = result.get(path) || { additions: 0, deletions: 0 }
        result.set(path, {
            additions: prev.additions + (Number.isNaN(additions) ? 0 : additions),
            deletions: prev.deletions + (Number.isNaN(deletions) ? 0 : deletions)
        })
    }
    return result
}

function parseStatusEntries(stdout: string, projectRelativeToRepo: string): GitStatusDetail[] {
    const entries = stdout.split('\0').filter(Boolean)
    const details: GitStatusDetail[] = []

    for (let i = 0; i < entries.length; i += 1) {
        const line = entries[i]
        if (line.length < 3) continue
        const code = line.substring(0, 2)
        const rawPath = line.substring(3)
        const status = classifyGitStatus(code)
        const path = stripPathPrefix(normalizeGitPath(rawPath), projectRelativeToRepo)
        if (!path) continue

        const indexCode = code[0] || ' '
        const workTreeCode = code[1] || ' '
        const staged = code !== '??' && code !== '!!' && indexCode !== ' '
        const unstaged = code === '??' || (code !== '!!' && workTreeCode !== ' ')

        let previousPath: string | undefined
        if (status === 'renamed') {
            const rawPrevious = entries[i + 1]
            if (rawPrevious) {
                previousPath = stripPathPrefix(normalizeGitPath(rawPrevious), projectRelativeToRepo) || undefined
                i += 1
            }
        }

        details.push({
            path,
            previousPath,
            status,
            code,
            staged,
            unstaged,
            additions: 0,
            deletions: 0,
            stagedAdditions: 0,
            stagedDeletions: 0,
            unstagedAdditions: 0,
            unstagedDeletions: 0,
            statsLoaded: false
        })
    }

    return details
}

function hasOriginRemote(remotes: Array<{ name: string; refs?: { fetch?: string; push?: string } }>): boolean {
    return remotes.some((remote) => remote.name === 'origin' && (remote.refs?.fetch || remote.refs?.push))
}

export async function getGitStatusDetailed(
    projectPath: string,
    options?: GitStatusDetailedOptions
): Promise<GitStatusDetail[]> {
    try {
        const git = createGit(projectPath)
        const repoContext = await getRepoContext(git, projectPath)
        const stdout = await git.raw(['-c', 'status.relativePaths=true', 'status', '--porcelain=v1', '--ignored', '-z'])
        const details = parseStatusEntries(stdout, repoContext.projectRelativeToRepo)

        if (options?.includeStats !== false && details.length > 0) {
            const [stagedNumstatRaw, unstagedNumstatRaw] = await Promise.all([
                git.raw(['diff', '--cached', '--numstat']).catch(() => ''),
                git.raw(['diff', '--numstat']).catch(() => '')
            ])

            const stagedNumstat = parseNumstat(stagedNumstatRaw, repoContext.projectRelativeToRepo)
            const unstagedNumstat = parseNumstat(unstagedNumstatRaw, repoContext.projectRelativeToRepo)

            for (const detail of details) {
                applyStatusStats(detail, stagedNumstat, unstagedNumstat)
            }
        }

        details.sort((a, b) => a.path.localeCompare(b.path))
        return details
    } catch (err) {
        log.error('Failed to get detailed git status', err)
        throw toError(err, 'Failed to get detailed git status')
    }
}

export async function getGitStatus(projectPath: string): Promise<GitStatusMap> {
    try {
        const details = await getGitStatusDetailed(projectPath, { includeStats: false })
        return toStatusDetailMap(details)
    } catch (err) {
        log.error('Failed to get git status', err)
        throw toError(err, 'Failed to get git status')
    }
}

export async function hasRemoteOrigin(projectPath: string): Promise<boolean> {
    try {
        const git = createGit(projectPath)
        const remotes = await git.getRemotes(true)
        return hasOriginRemote(remotes)
    } catch (err) {
        log.error('Failed to inspect remotes', err)
        throw toError(err, 'Failed to inspect remotes')
    }
}

export async function getGitSyncStatus(projectPath: string): Promise<GitSyncStatus> {
    try {
        const git = createGit(projectPath)
        const [currentBranchRaw, headHashRaw, upstreamBranchRaw, workingTreeRaw, remotes] = await Promise.all([
            git.raw(['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => 'HEAD'),
            git.raw(['rev-parse', 'HEAD']).catch(() => ''),
            git.raw(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).catch(() => ''),
            git.raw(['status', '--porcelain=v1', '-uno']).catch(() => ''),
            git.getRemotes(true).catch(() => [])
        ])

        const currentBranch = String(currentBranchRaw || '').trim()
        const headHash = String(headHashRaw || '').trim() || null
        const upstreamBranch = String(upstreamBranchRaw || '').trim() || null
        const hasRemote = hasOriginRemote(remotes)
        const workingTreeLines = String(workingTreeRaw || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
        const workingTreeChangeCount = workingTreeLines.length

        let ahead = 0
        let behind = 0
        let upstreamHeadHash: string | null = null

        if (upstreamBranch) {
            const [aheadBehindRaw, upstreamHeadHashRaw] = await Promise.all([
                git.raw(['rev-list', '--left-right', '--count', 'HEAD...@{u}']).catch(() => ''),
                git.raw(['rev-parse', '@{u}']).catch(() => '')
            ])

            const [aheadText, behindText] = String(aheadBehindRaw || '').trim().split(/\s+/)
            ahead = Number.parseInt(aheadText || '0', 10)
            behind = Number.parseInt(behindText || '0', 10)
            upstreamHeadHash = String(upstreamHeadHashRaw || '').trim() || null
        }

        return {
            currentBranch,
            upstreamBranch,
            headHash,
            upstreamHeadHash,
            hasRemote,
            ahead: Number.isNaN(ahead) ? 0 : ahead,
            behind: Number.isNaN(behind) ? 0 : behind,
            workingTreeChanged: workingTreeChangeCount > 0,
            workingTreeChangeCount,
            statusToken: [
                currentBranch,
                headHash || '',
                upstreamBranch || '',
                upstreamHeadHash || '',
                workingTreeChangeCount
            ].join('|'),
            detached: currentBranch === 'HEAD'
        }
    } catch (err) {
        log.error('Failed to get git sync status', err)
        throw toError(err, 'Failed to get git sync status')
    }
}

export async function getIncomingCommits(projectPath: string, limit: number = 100): Promise<GitCommit[]> {
    try {
        const git = createGit(projectPath)
        const upstreamRef = String(
            await git.raw(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).catch(() => '')
        ).trim()
        if (!upstreamRef) return []

        const safeLimit = Math.trunc(limit)
        const limitArgs = safeLimit > 0 ? ['-n', String(Math.max(1, Math.min(1000, safeLimit)))] : []
        const stdout = await git.raw([
            'log',
            `HEAD..${upstreamRef}`,
            '--date=iso',
            '--pretty=format:%x1e%H%x1f%P%x1f%an%x1f%ad%x1f%s',
            '--numstat',
            ...limitArgs
        ]).catch(() => '')

        if (!stdout.trim()) return []
        return parseCommitLog(stdout)
    } catch (err) {
        log.error('Failed to get incoming commits', err)
        throw toError(err, 'Failed to get incoming commits')
    }
}

export async function getUnpushedCommits(projectPath: string): Promise<GitCommit[]> {
    try {
        const git = createGit(projectPath)
        const [currentBranchRaw, remotes, upstreamRefRaw] = await Promise.all([
            git.raw(['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => 'HEAD'),
            git.getRemotes(true).catch(() => []),
            git.raw([
                'rev-parse',
                '--abbrev-ref',
                '--symbolic-full-name',
                '@{u}'
            ]).catch(() => '')
        ])
        const currentBranch = String(currentBranchRaw || '').trim()
        const hasRemote = hasOriginRemote(remotes)
        const upstreamRef = String(upstreamRefRaw || '').trim()

        let stdout = ''
        if (upstreamRef) {
            stdout = await git.raw([
                'log',
                `${upstreamRef}..HEAD`,
                '--date=iso',
                '--pretty=format:%x1e%H%x1f%P%x1f%an%x1f%ad%x1f%s'
            ]).catch(() => '')
        } else if (hasRemote && currentBranch !== 'HEAD') {
            stdout = await git.raw([
                'log',
                `origin/${currentBranch}..HEAD`,
                '--date=iso',
                '--pretty=format:%x1e%H%x1f%P%x1f%an%x1f%ad%x1f%s'
            ]).catch(() => '')
        } else {
            stdout = await git.raw([
                'log',
                'HEAD',
                '--date=iso',
                '--pretty=format:%x1e%H%x1f%P%x1f%an%x1f%ad%x1f%s',
                '-n',
                '50'
            ]).catch(() => '')
        }

        if (!stdout.trim()) return []
        return parseCommitLog(stdout, { statsIncluded: false })
    } catch (err) {
        log.error('Failed to get unpushed commits', err)
        throw toError(err, 'Failed to get unpushed commits')
    }
}

export async function checkIsGitRepo(projectPath: string): Promise<boolean> {
    try {
        const git = createGit(projectPath)
        return await git.checkIsRepo()
    } catch (err) {
        log.error('Failed to detect git repository', err)
        throw toError(err, 'Failed to detect git repository')
    }
}

export async function getProjectGitOverview(projectPath: string): Promise<ProjectGitOverview> {
    try {
        const git = createGit(projectPath)
        const isGitRepo = await git.checkIsRepo()
        if (!isGitRepo) {
            return {
                path: projectPath,
                isGitRepo: false,
                changedCount: 0,
                unpushedCount: 0,
                hasRemote: false
            }
        }

        const [statusMap, unpushedCommits, remotes] = await Promise.all([
            getGitStatus(projectPath),
            getUnpushedCommits(projectPath),
            git.getRemotes(true).catch(() => [])
        ])
        const hasRemote = hasOriginRemote(remotes)

        return {
            path: projectPath,
            isGitRepo: true,
            changedCount: countTrackedChanges(statusMap),
            unpushedCount: unpushedCommits.length,
            hasRemote
        }
    } catch (err) {
        return {
            path: projectPath,
            isGitRepo: false,
            changedCount: 0,
            unpushedCount: 0,
            hasRemote: false,
            error: toErrorMessage(err, 'Failed to inspect repository')
        }
    }
}

export async function getProjectsGitOverview(
    projectPaths: string[],
    maxConcurrent: number = 5
): Promise<ProjectGitOverview[]> {
    const uniquePaths = Array.from(
        new Set(
            projectPaths
                .filter((path) => typeof path === 'string')
                .map((path) => path.trim())
                .filter(Boolean)
        )
    )

    if (uniquePaths.length === 0) return []

    const results: ProjectGitOverview[] = new Array(uniquePaths.length)
    let index = 0
    const workerCount = Math.max(1, Math.min(maxConcurrent, uniquePaths.length))

    await Promise.all(
        Array.from({ length: workerCount }, async () => {
            while (true) {
                const currentIndex = index
                index += 1
                if (currentIndex >= uniquePaths.length) return
                results[currentIndex] = await getProjectGitOverview(uniquePaths[currentIndex])
            }
        })
    )

    return results
}
