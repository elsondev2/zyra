import log from 'electron-log'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { assertNonEmpty, createGit, getRepoContext, toError, toErrorMessage, toPathSpec } from './core'
import type { GitWriteScope } from './write-shared'
import { getScopedPathSpec, isBranchPathspecNotFound, normalizeWriteScope, withIndexLockRecovery } from './write-shared'

export type { GitWriteScope } from './write-shared'
export {
    addRemote,
    addRemoteOrigin,
    applyStash,
    checkoutBranch,
    createBranch,
    createStash,
    createTag,
    deleteBranch,
    deleteTag,
    dropStash,
    listBranches,
    listRemotes,
    listStashes,
    listTags,
    removeRemote,
    setRemoteUrl
} from './write-repo-admin'

type GitPushOptions = {
    remoteName?: string
    branchName?: string
}

type GitPullOptions = {
    remoteName?: string
    branchName?: string
    pushRemoteName?: string
}

/**
 * Stage files for commit
 */
export async function stageFiles(
    projectPath: string,
    files: string[],
    options?: { scope?: GitWriteScope }
): Promise<void> {
    try {
        if (files.length === 0 && !options?.scope) return
        const scope = normalizeWriteScope(options?.scope)

        await withIndexLockRecovery(projectPath, 'stage files', async (git) => {
            const repoContext = await getRepoContext(git, projectPath)
            const pathSpecs = files.length > 0
                ? Array.from(new Set(
                    (await Promise.all(files.map((file) => toPathSpec(git, projectPath, file, repoContext))))
                        .filter((pathSpec) => pathSpec && pathSpec.trim().length > 0)
                ))
                : [getScopedPathSpec(repoContext.projectRelativeToRepo, scope)]
            if (pathSpecs.length === 0 || pathSpecs.every((pathSpec) => !pathSpec.trim())) return
            await git.add(['-A', '--', ...pathSpecs])
        })
    } catch (err) {
        log.error('Failed to stage files', err)
        throw toError(err, 'Failed to stage files')
    }
}

export async function setGlobalGitUser(name: string, email: string): Promise<void> {
    try {
        assertNonEmpty(name, 'Git user name')
        assertNonEmpty(email, 'Git user email')
        const git = createGit(process.cwd())
        await git.raw(['config', '--global', 'user.name', name.trim()])
        await git.raw(['config', '--global', 'user.email', email.trim()])
    } catch (err) {
        log.error('Failed to set global git user', err)
        throw toError(err, 'Failed to set global git user')
    }
}

export async function createCommit(projectPath: string, message: string): Promise<void> {
    try {
        assertNonEmpty(message, 'Commit message')
        await withIndexLockRecovery(projectPath, 'create commit', async (git) => {
            await git.commit(message.trim())
        })
    } catch (err) {
        log.error('Failed to create commit', err)
        throw toError(err, 'Failed to create commit')
    }
}

function parseUpstreamRef(upstreamRef: string): { remoteName: string; branchName: string } | null {
    const normalized = String(upstreamRef || '').trim()
    if (!normalized || !normalized.includes('/')) return null

    const [remoteName, ...branchParts] = normalized.split('/')
    const branchName = branchParts.join('/').trim()
    if (!remoteName || !branchName) return null

    return { remoteName, branchName }
}

function isRemoteAheadPushError(message: string): boolean {
    const normalized = String(message || '').trim()
    if (!normalized) return false

    return (
        /\bnon-fast-forward\b/i.test(normalized)
        || /\bfetch first\b/i.test(normalized)
        || /\[rejected\]\s+\(fetch first\)/i.test(normalized)
    )
}

async function pushCommitRange(projectPath: string, targetCommitHash?: string, options?: GitPushOptions): Promise<void> {
    let resolvedRemoteName = String(options?.remoteName || '').trim() || 'origin'
    let resolvedRemoteBranch = String(options?.branchName || '').trim()

    try {
        const remoteNameOverride = String(options?.remoteName || '').trim()

        await withIndexLockRecovery(projectPath, 'push commits', async (git) => {
            const remotes = await git.getRemotes()
            const chosenRemoteName = remoteNameOverride || 'origin'
            resolvedRemoteName = chosenRemoteName
            if (!remotes.some((remote) => remote.name === chosenRemoteName)) {
                throw new Error(`No remote "${chosenRemoteName}" configured`)
            }

            const upstreamRef = (await git.raw([
                'rev-parse',
                '--abbrev-ref',
                '--symbolic-full-name',
                '@{u}'
            ]).catch(() => '')).trim()

            const targetHash = String(targetCommitHash || '').trim()
            if (targetHash) {
                const branch = String(options?.branchName || '').trim() || (await git.raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
                if (!branch || branch === 'HEAD') {
                    throw new Error('Cannot push a single commit from detached HEAD')
                }

                await git.raw(['merge-base', '--is-ancestor', targetHash, 'HEAD']).catch(() => {
                    throw new Error('Selected commit is not reachable from the current branch head')
                })

                const upstream = parseUpstreamRef(upstreamRef)
                const remoteName = remoteNameOverride || upstream?.remoteName || 'origin'
                const remoteBranch = upstream?.branchName || branch
                const remoteTrackingRef = upstreamRef || `${remoteName}/${remoteBranch}`
                resolvedRemoteName = remoteName
                resolvedRemoteBranch = remoteBranch

                if (upstreamRef) {
                    await git.raw(['merge-base', '--is-ancestor', remoteTrackingRef, targetHash]).catch(() => {
                        throw new Error('Selected commit cannot be pushed by itself because it would not fast-forward the remote branch')
                    })
                }

                const pushArgs = upstreamRef
                    ? [remoteName, `${targetHash}:refs/heads/${remoteBranch}`]
                    : ['-u', remoteName, `${targetHash}:refs/heads/${remoteBranch}`]
                await git.push(pushArgs)
                return
            }

            if (upstreamRef && !remoteNameOverride && !options?.branchName) {
                const upstream = parseUpstreamRef(upstreamRef)
                resolvedRemoteName = upstream?.remoteName || chosenRemoteName
                resolvedRemoteBranch = upstream?.branchName || resolvedRemoteBranch
                await git.push()
                return
            }

            const branch = String(options?.branchName || '').trim() || (await git.raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
            if (!branch || branch === 'HEAD') {
                throw new Error('Cannot push detached HEAD without specifying a branch')
            }

            resolvedRemoteBranch = branch
            await git.push(['-u', chosenRemoteName, `${branch}:refs/heads/${branch}`])
        })
    } catch (err) {
        const message = toErrorMessage(err, '')
        if (isRemoteAheadPushError(message)) {
            try {
                await fetchUpdates(projectPath, resolvedRemoteName)
            } catch {
                // Best-effort refresh of remote-tracking refs so the UI can reflect the behind state.
            }

            const targetRef = [resolvedRemoteName, resolvedRemoteBranch].filter(Boolean).join('/')
            throw new Error(
                targetRef
                    ? `Remote branch ${targetRef} has new commits. Pull or rebase the latest remote changes, then push again.`
                    : 'Remote branch has new commits. Pull or rebase the latest remote changes, then push again.'
            )
        }

        log.error('Failed to push commits', err)
        throw toError(err, 'Failed to push commits')
    }
}

export async function pushCommits(projectPath: string, options?: GitPushOptions): Promise<void> {
    await pushCommitRange(projectPath, undefined, options)
}

export async function pushSingleCommit(projectPath: string, commitHash: string, options?: GitPushOptions): Promise<void> {
    try {
        assertNonEmpty(commitHash, 'Commit hash')
        await pushCommitRange(projectPath, commitHash.trim(), options)
    } catch (err) {
        log.error('Failed to push single commit', err)
        throw toError(err, 'Failed to push single commit')
    }
}

export async function initGitRepo(
    projectPath: string,
    branchName: string,
    createGitignore: boolean,
    gitignoreTemplate?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        assertNonEmpty(branchName, 'Branch name')
        await withIndexLockRecovery(projectPath, 'initialize git repository', async (git) => {
            await git.init()
            await git.raw(['check-ref-format', '--branch', branchName.trim()])
            await git.raw(['branch', '-M', branchName.trim()])
        })

        if (createGitignore && gitignoreTemplate) {
            const gitignorePath = join(projectPath, '.gitignore')
            await writeFile(gitignorePath, gitignoreTemplate, 'utf-8')
        }

        return { success: true }
    } catch (err: any) {
        log.error('Failed to initialize git repo', err)
        return { success: false, error: err.message || 'Failed to initialize git repository' }
    }
}

export async function createInitialCommit(projectPath: string, message: string): Promise<{ success: boolean; error?: string }> {
    try {
        assertNonEmpty(message, 'Commit message')
        await withIndexLockRecovery(projectPath, 'create initial commit', async (git) => {
            await git.add('.')
            await git.commit(message.trim())
        })
        return { success: true }
    } catch (err: any) {
        log.error('Failed to create initial commit', err)
        return { success: false, error: err.message || 'Failed to create initial commit' }
    }
}

export async function unstageFiles(
    projectPath: string,
    files: string[],
    options?: { scope?: GitWriteScope }
): Promise<void> {
    try {
        if (files.length === 0 && !options?.scope) return
        const scope = normalizeWriteScope(options?.scope)
        await withIndexLockRecovery(projectPath, 'unstage files', async (git) => {
            const repoContext = await getRepoContext(git, projectPath)
            const pathSpecs = files.length > 0
                ? Array.from(new Set(
                    (await Promise.all(files.map((file) => toPathSpec(git, projectPath, file, repoContext))))
                        .filter((pathSpec) => pathSpec && pathSpec.trim().length > 0)
                ))
                : [getScopedPathSpec(repoContext.projectRelativeToRepo, scope)]
            if (pathSpecs.length === 0 || pathSpecs.every((pathSpec) => !pathSpec.trim())) return
            await git.raw(['reset', 'HEAD', '--', ...pathSpecs])
        })
    } catch (err) {
        log.error('Failed to unstage files', err)
        throw toError(err, 'Failed to unstage files')
    }
}

export async function discardChanges(
    projectPath: string,
    files: string[],
    options?: { scope?: GitWriteScope; mode?: 'unstaged' | 'staged' | 'both' }
): Promise<void> {
    try {
        if (files.length === 0 && !options?.scope) return
        const scope = normalizeWriteScope(options?.scope)
        await withIndexLockRecovery(projectPath, 'discard changes', async (git) => {
            const repoContext = await getRepoContext(git, projectPath)
            const pathSpecs = files.length > 0
                ? Array.from(new Set(
                    (await Promise.all(files.map((file) => toPathSpec(git, projectPath, file, repoContext))))
                        .filter((pathSpec) => pathSpec && pathSpec.trim().length > 0)
                ))
                : [getScopedPathSpec(repoContext.projectRelativeToRepo, scope)]
            if (pathSpecs.length === 0 || pathSpecs.every((pathSpec) => !pathSpec.trim())) return
            const mode = options?.mode ?? 'both'
            if (mode === 'staged') {
                await git.raw(['restore', '--staged', '--', ...pathSpecs]).catch(async () => {
                    await git.raw(['reset', 'HEAD', '--', ...pathSpecs])
                })
                return
            }
            if (mode === 'unstaged') {
                await git.raw(['restore', '--worktree', '--', ...pathSpecs]).catch(async (err) => {
                    const message = toErrorMessage(err, '')
                    if (!isBranchPathspecNotFound(message)) {
                        throw err
                    }
                })
                await git.raw(['clean', '-f', '-d', '--', ...pathSpecs]).catch(async (err) => {
                    const message = toErrorMessage(err, '')
                    if (!isBranchPathspecNotFound(message)) {
                        throw err
                    }
                })
                return
            }
            await git.raw(['restore', '--staged', '--worktree', '--', ...pathSpecs]).catch(async () => {
                await git.raw(['checkout', '--', ...pathSpecs])
            })
        })
    } catch (err) {
        log.error('Failed to discard changes', err)
        throw toError(err, 'Failed to discard changes')
    }
}

export async function fetchUpdates(projectPath: string, remoteName: string = 'origin'): Promise<void> {
    try {
        await withIndexLockRecovery(projectPath, 'fetch updates', async (git) => {
            await git.fetch(remoteName)
        })
    } catch (err) {
        log.error('Failed to fetch updates', err)
        throw toError(err, 'Failed to fetch updates')
    }
}

export async function pullUpdates(projectPath: string, options?: GitPullOptions): Promise<void> {
    try {
        await withIndexLockRecovery(projectPath, 'pull updates', async (git) => {
            const remoteName = String(options?.remoteName || '').trim()
            const pushRemoteName = String(options?.pushRemoteName || '').trim()
            const branchName = String(options?.branchName || '').trim()

            if (!remoteName && !pushRemoteName && !branchName) {
                await git.pull()
                return
            }

            const remotes = await git.getRemotes()
            if (remoteName && !remotes.some((remote) => remote.name === remoteName)) {
                throw new Error(`No remote "${remoteName}" configured`)
            }
            if (pushRemoteName && !remotes.some((remote) => remote.name === pushRemoteName)) {
                throw new Error(`No remote "${pushRemoteName}" configured`)
            }

            const currentBranch = branchName || (await git.raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
            if (!currentBranch || currentBranch === 'HEAD') {
                throw new Error('Cannot pull updates from detached HEAD')
            }

            if (remoteName) {
                await git.pull(remoteName, currentBranch)
            } else {
                await git.pull()
            }

            if (pushRemoteName) {
                await git.push([pushRemoteName, `${currentBranch}:refs/heads/${currentBranch}`])
            }
        })
    } catch (err) {
        log.error('Failed to pull updates', err)
        throw toError(err, 'Failed to pull updates')
    }
}
