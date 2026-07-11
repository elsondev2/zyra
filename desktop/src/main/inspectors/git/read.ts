import log from 'electron-log'
import {
    compactPatchForAI,
    createGit,
    getRepoContext,
    normalizeGitPath,
    parseCommitLog,
    parseRepoOwner,
    stripPathPrefix,
    toError,
    toErrorMessage,
    toPathSpec,
    assertNonEmpty
} from './core'
import {
    applyStatusStats,
    getGitStatus,
    getGitStatusDetailed,
    getGitSyncStatus,
    getIncomingCommits,
    getProjectGitOverview,
    getProjectsGitOverview,
    getUnpushedCommits,
    hasRemoteOrigin,
    parseNumstat
} from './read-repo-state'
import type {
    GitCommit,
    GitHistoryCountResult,
    GitStatusDetail,
    GitStatusEntryStats,
    GitHistoryResult
} from './types'

export {
    getGitStatus,
    getGitStatusDetailed,
    hasRemoteOrigin,
    getGitSyncStatus,
    getIncomingCommits,
    getUnpushedCommits,
    getProjectGitOverview,
    getProjectsGitOverview,
    checkIsGitRepo
} from './read-repo-state'

interface GitHistoryOptions {
    all?: boolean
    includeStats?: boolean
}
/**
 * Get git history for a project
 */
export async function getGitHistory(
    projectPath: string,
    limit: number = 0,
    options?: GitHistoryOptions
): Promise<GitHistoryResult> {
    try {
        const git = createGit(projectPath)
        const safeLimit = Math.trunc(limit)
        const limitArgs = safeLimit > 0 ? ['-n', String(Math.max(1, Math.min(5000, safeLimit)))] : []
        const stdout = await git.raw([
            'log',
            ...(options?.all === false ? [] : ['--all']),
            '--date=iso',
            '--pretty=format:%x1e%H%x1f%P%x1f%an%x1f%ad%x1f%s',
            ...(options?.includeStats === false ? [] : ['--numstat']),
            ...limitArgs
        ])

        return { commits: parseCommitLog(stdout, { statsIncluded: options?.includeStats !== false }) }
    } catch (err) {
        log.error('Failed to get git history', err)
        throw toError(err, 'Failed to get git history')
    }
}
export async function getGitHistoryCount(
    projectPath: string,
    options?: { all?: boolean }
): Promise<GitHistoryCountResult> {
    try {
        const git = createGit(projectPath)
        const stdout = await git.raw([
            'rev-list',
            '--count',
            ...(options?.all === false ? ['HEAD'] : ['--all'])
        ])

        const totalCount = Number.parseInt(String(stdout || '').trim(), 10)
        return {
            totalCount: Number.isNaN(totalCount) ? 0 : Math.max(0, totalCount)
        }
    } catch (err) {
        log.error('Failed to get git history count', err)
        throw toError(err, 'Failed to get git history count')
    }
}
export async function getGitStatusEntryStats(projectPath: string, filePaths: string[]): Promise<GitStatusEntryStats[]> {
    try {
        const uniquePaths = Array.from(
            new Set(
                filePaths
                    .filter((path) => typeof path === 'string')
                    .map((path) => normalizeGitPath(path).trim())
                    .filter(Boolean)
            )
        )

        if (uniquePaths.length === 0) {
            return []
        }

        const projectGit = createGit(projectPath)
        const repoContext = await getRepoContext(projectGit, projectPath)
        const repoGit = createGit(repoContext.repoRoot)
        const pathSpecs = await Promise.all(
            uniquePaths.map((path) => toPathSpec(repoGit, projectPath, path, repoContext))
        )

        const diffArgs = pathSpecs.length > 0 ? ['--', ...pathSpecs] : []
        const [stagedNumstatRaw, unstagedNumstatRaw] = await Promise.all([
            repoGit.raw(['diff', '--cached', '--numstat', ...diffArgs]).catch(() => ''),
            repoGit.raw(['diff', '--numstat', ...diffArgs]).catch(() => '')
        ])

        const stagedNumstat = parseNumstat(stagedNumstatRaw, repoContext.projectRelativeToRepo)
        const unstagedNumstat = parseNumstat(unstagedNumstatRaw, repoContext.projectRelativeToRepo)

        return uniquePaths.map((path) => {
            const entry: GitStatusEntryStats = {
                path,
                additions: 0,
                deletions: 0,
                stagedAdditions: 0,
                stagedDeletions: 0,
                unstagedAdditions: 0,
                unstagedDeletions: 0,
                statsLoaded: true
            }
            applyStatusStats(entry, stagedNumstat, unstagedNumstat)
            return entry
        })
    } catch (err) {
        log.error('Failed to get git status entry stats', err)
        throw toError(err, 'Failed to get git status entry stats')
    }
}

export async function getGitCommitStats(projectPath: string, commitHashes: string[]): Promise<GitCommit[]> {
    try {
        const uniqueHashes = Array.from(
            new Set(
                commitHashes
                    .filter((hash) => typeof hash === 'string')
                    .map((hash) => hash.trim())
                    .filter(Boolean)
            )
        )

        if (uniqueHashes.length === 0) {
            return []
        }

        const git = createGit(projectPath)
        const stdout = await git.raw([
            'log',
            '--no-walk=unsorted',
            '--date=iso',
            '--pretty=format:%x1e%H%x1f%P%x1f%an%x1f%ad%x1f%s',
            '--numstat',
            ...uniqueHashes
        ])

        return parseCommitLog(stdout, { statsIncluded: true })
    } catch (err) {
        log.error('Failed to get git commit stats', err)
        throw toError(err, 'Failed to get git commit stats')
    }
}

/**
 * Get diff for a specific commit
 */
export async function getCommitDiff(projectPath: string, commitHash: string): Promise<string> {
    try {
        assertNonEmpty(commitHash, 'Commit hash')
        const git = createGit(projectPath)
        return await git.raw(['show', commitHash.trim(), '--format=fuller'])
    } catch (err) {
        log.error('Failed to get commit diff', err)
        throw toError(err, 'Failed to get commit diff')
    }
}

/**
 * Get diff for working changes (unstaged + staged)
 */
export async function getWorkingDiff(
    projectPath: string,
    filePath?: string,
    mode: 'combined' | 'staged' | 'unstaged' = 'combined'
): Promise<string> {
    try {
        const projectGit = createGit(projectPath)
        const repoContext = await getRepoContext(projectGit, projectPath)
        const git = createGit(repoContext.repoRoot)
        const pathSpec = filePath
            ? ['--', await toPathSpec(git, projectPath, filePath, repoContext)]
            : []
        const staged = await git.raw(['diff', '--cached', ...pathSpec]).catch(() => '')
        const unstaged = await git.raw(['diff', ...pathSpec]).catch(() => '')

        if (mode === 'staged') {
            return staged || 'No changes'
        }
        if (mode === 'unstaged') {
            return unstaged || 'No changes'
        }

        const combined = [staged, unstaged].filter(Boolean).join('\n')
        return combined || 'No changes'
    } catch (err) {
        log.error('Failed to get working diff', err)
        throw toError(err, 'Failed to get working diff')
    }
}

/**
 * Build richer git context for commit-message AI.
 */
export async function getWorkingChangesForAI(projectPath: string): Promise<string> {
    try {
        const git = createGit(projectPath)
        const [statusShortRaw, stagedStatRaw, unstagedStatRaw, stagedPatchRaw, unstagedPatchRaw] = await Promise.all([
            git.raw(['status', '--short']).catch(() => ''),
            git.raw(['diff', '--cached', '--stat']).catch(() => ''),
            git.raw(['diff', '--stat']).catch(() => ''),
            git.raw(['diff', '--cached', '--unified=2']).catch(() => ''),
            git.raw(['diff', '--unified=2']).catch(() => '')
        ])

        const toText = (value: string | string[]): string => (Array.isArray(value) ? value.join('\n') : value)

        const statusShort = toText(statusShortRaw)
        const stagedStat = toText(stagedStatRaw)
        const unstagedStat = toText(unstagedStatRaw)
        const stagedPatch = toText(stagedPatchRaw)
        const unstagedPatch = toText(unstagedPatchRaw)

        if (!statusShort.trim() && !stagedPatch.trim() && !unstagedPatch.trim()) {
            return 'No changes'
        }

        const stagedPatchCompact = compactPatchForAI(stagedPatch)
        const unstagedPatchCompact = compactPatchForAI(unstagedPatch)

        const sections: string[] = []
        sections.push('## WORKING TREE STATUS (SHORT)')
        sections.push(statusShort.trim() || '(none)')
        sections.push('')
        sections.push('## STAGED CHANGES STAT')
        sections.push(stagedStat.trim() || '(none)')
        sections.push('')
        sections.push('## UNSTAGED CHANGES STAT')
        sections.push(unstagedStat.trim() || '(none)')
        sections.push('')
        sections.push('## STAGED PATCH')
        sections.push(stagedPatchCompact.text || '(none)')
        if (stagedPatchCompact.omittedFiles.length > 0) {
            sections.push('')
            sections.push('### STAGED PATCH OMITTED FILES')
            sections.push(stagedPatchCompact.omittedFiles.slice(0, 30).join('\n'))
            if (stagedPatchCompact.omittedFiles.length > 30) {
                sections.push(`... (${stagedPatchCompact.omittedFiles.length - 30} more omitted files)`)
            }
        }
        sections.push('')
        sections.push('## UNSTAGED PATCH')
        sections.push(unstagedPatchCompact.text || '(none)')
        if (unstagedPatchCompact.omittedFiles.length > 0) {
            sections.push('')
            sections.push('### UNSTAGED PATCH OMITTED FILES')
            sections.push(unstagedPatchCompact.omittedFiles.slice(0, 30).join('\n'))
            if (unstagedPatchCompact.omittedFiles.length > 30) {
                sections.push(`... (${unstagedPatchCompact.omittedFiles.length - 30} more omitted files)`)
            }
        }

        return sections.join('\n')
    } catch (err) {
        log.error('Failed to get working changes context for AI', err)
        throw toError(err, 'Failed to get working changes context')
    }
}


export async function getGitUser(projectPath: string): Promise<{ name: string; email: string } | null> {
    try {
        const git = createGit(projectPath)
        const config = await git.listConfig()
        const toSingleValue = (value: string | string[] | undefined): string =>
            (Array.isArray(value) ? value[0] : value) || ''

        const name = toSingleValue(config.all?.['user.name']).trim()
        const email = toSingleValue(config.all?.['user.email']).trim()
        if (!name && !email) return null
        return { name, email }
    } catch (err) {
        log.error('Failed to get git user config', err)
        throw toError(err, 'Failed to get git user config')
    }
}

export async function getGlobalGitUser(): Promise<{ name: string; email: string } | null> {
    try {
        const git = createGit(process.cwd())
        const [nameRaw, emailRaw] = await Promise.all([
            git.raw(['config', '--global', '--get', 'user.name']).catch(() => ''),
            git.raw(['config', '--global', '--get', 'user.email']).catch(() => '')
        ])

        const name = String(nameRaw || '').trim()
        const email = String(emailRaw || '').trim()
        if (!name && !email) return null
        return { name, email }
    } catch (err) {
        log.error('Failed to get global git user config', err)
        throw toError(err, 'Failed to get global git user config')
    }
}

export async function getRepoOwner(projectPath: string): Promise<string | null> {
    try {
        const git = createGit(projectPath)
        const remotes = await git.getRemotes(true)
        const origin = remotes.find((remote) => remote.name === 'origin')
        const remoteUrl = origin?.refs.fetch || origin?.refs.push || ''
        return parseRepoOwner(remoteUrl)
    } catch (err) {
        log.error('Failed to get repository owner', err)
        throw toError(err, 'Failed to get repository owner')
    }
}
