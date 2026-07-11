import log from 'electron-log'
import {
    cleanupStaleIndexLock,
    createGit,
    getRepoContext,
    isGitIndexLockConflict,
    toError,
    toErrorMessage
} from './core'

const INDEX_LOCK_MAX_ATTEMPTS = 8
const INDEX_LOCK_RETRY_DELAY_MS = 350

export type GitWriteScope = 'project' | 'repo'
export type GitAction<T> = (git: ReturnType<typeof createGit>) => Promise<T>

const repoWriteQueues = new Map<string, Promise<void>>()

export function isBranchPathspecNotFound(message: string): boolean {
    return /pathspec .* did not match any file/i.test(message)
        || /did not match any branch/i.test(message)
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export function normalizeWriteScope(scope?: GitWriteScope): GitWriteScope {
    return scope === 'project' ? 'project' : 'repo'
}

export function getScopedPathSpec(projectRelativeToRepo: string, scope: GitWriteScope): string {
    if (scope === 'project') {
        const normalized = String(projectRelativeToRepo || '').trim()
        return normalized || '.'
    }
    return '.'
}

function getQueueKey(projectPath: string): string {
    const normalized = projectPath.trim()
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

export async function resolveRepoQueuePath(projectPath: string): Promise<string> {
    try {
        const git = createGit(projectPath)
        const root = (await git.raw(['rev-parse', '--show-toplevel'])).trim()
        if (!root) return projectPath
        return root
    } catch {
        return projectPath
    }
}

export function enqueueRepoWrite<T>(projectPath: string, actionLabel: string, task: () => Promise<T>): Promise<T> {
    const queueKey = getQueueKey(projectPath)
    const previous = repoWriteQueues.get(queueKey) ?? Promise.resolve()

    const run = previous
        .catch(() => undefined)
        .then(async () => {
            log.debug(`[GitQueue] Starting ${actionLabel} in ${projectPath}`)
            return await task()
        })

    const completion = run.then(() => undefined, () => undefined)
    repoWriteQueues.set(queueKey, completion)
    completion.finally(() => {
        if (repoWriteQueues.get(queueKey) === completion) {
            repoWriteQueues.delete(queueKey)
        }
    })

    return run
}

export async function withIndexLockRecovery<T>(
    projectPath: string,
    actionLabel: string,
    action: GitAction<T>
): Promise<T> {
    const queuePath = await resolveRepoQueuePath(projectPath)
    return enqueueRepoWrite(queuePath, actionLabel, async () => {
        let lastError: unknown = null

        for (let attempt = 1; attempt <= INDEX_LOCK_MAX_ATTEMPTS; attempt += 1) {
            const projectGit = createGit(projectPath)

            try {
                const repoContext = await getRepoContext(projectGit, projectPath).catch(() => null)
                const git = repoContext?.repoRoot
                    ? createGit(repoContext.repoRoot)
                    : projectGit
                return await action(git)
            } catch (err) {
                lastError = err
                const message = toErrorMessage(err, `Failed to ${actionLabel}`)
                if (!isGitIndexLockConflict(message)) {
                    throw err
                }

                try {
                    const cleanupResult = await cleanupStaleIndexLock(projectPath)
                    if (cleanupResult === 'removed') {
                        log.warn(`[Git] Removed stale index.lock before retrying ${actionLabel}`)
                    }

                    const hasMoreAttempts = attempt < INDEX_LOCK_MAX_ATTEMPTS
                    if (!hasMoreAttempts) {
                        if (cleanupResult === 'active') {
                            throw new Error(
                                `Git index is locked by another running Git process. Wait for it to finish, then retry ${actionLabel}.`
                            )
                        }
                        break
                    }

                    const delayMs = cleanupResult === 'active'
                        ? INDEX_LOCK_RETRY_DELAY_MS * attempt
                        : 60
                    await sleep(delayMs)
                } catch (lockCleanupErr) {
                    lastError = lockCleanupErr
                    throw lockCleanupErr
                }
            }
        }

        throw toError(lastError, `Failed to ${actionLabel}`)
    })
}
