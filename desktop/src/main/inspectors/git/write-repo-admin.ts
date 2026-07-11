import log from 'electron-log'
import {
    assertNonEmpty,
    cleanupStaleIndexLock,
    createGit,
    getRepoContext,
    isCheckoutBlockedByLocalChanges,
    isGitIndexLockConflict,
    toError,
    toErrorMessage
} from './core'
import type { CheckoutBranchOptions, CheckoutBranchResult, GitBranchSummary, GitRemoteSummary, GitTagSummary } from './types'
import { enqueueRepoWrite, isBranchPathspecNotFound, resolveRepoQueuePath, withIndexLockRecovery } from './write-shared'

export async function listBranches(projectPath: string): Promise<GitBranchSummary[]> {
    try {
        const git = createGit(projectPath)
        const [local, remote] = await Promise.all([
            git.branchLocal(),
            git.branch(['-r'])
        ])
        const remoteSet = new Set(remote.all.map((name) => name.trim()))

        const localSummaries: GitBranchSummary[] = local.all.map((name) => ({
            name,
            current: local.current === name,
            commit: local.branches[name]?.commit || '',
            label: local.branches[name]?.label || '',
            isRemote: remoteSet.has(`origin/${name}`),
            isLocal: true
        }))

        const localNames = new Set(local.all)
        const remoteOnlySummaries: GitBranchSummary[] = remote.all
            .map((name) => name.trim())
            .filter((name) => name.startsWith('origin/'))
            .filter((name) => !name.startsWith('origin/HEAD'))
            .map((name) => name.replace(/^origin\//, ''))
            .filter((name) => !!name && !localNames.has(name))
            .map((name) => ({
                name,
                current: false,
                commit: '',
                label: 'Remote tracking branch',
                isRemote: true,
                isLocal: false
            }))

        const combined = [...localSummaries, ...remoteOnlySummaries]
        combined.sort((a, b) => {
            if (a.current !== b.current) return a.current ? -1 : 1
            return a.name.localeCompare(b.name)
        })

        return combined
    } catch (err) {
        log.error('Failed to list branches', err)
        throw toError(err, 'Failed to list branches')
    }
}

export async function createBranch(projectPath: string, branchName: string, checkout: boolean = true): Promise<void> {
    try {
        assertNonEmpty(branchName, 'Branch name')
        await withIndexLockRecovery(projectPath, 'create branch', async (git) => {
            await git.raw(['check-ref-format', '--branch', branchName.trim()])
            if (checkout) {
                await git.checkoutLocalBranch(branchName.trim())
            } else {
                await git.branch([branchName.trim()])
            }
        })
    } catch (err) {
        log.error('Failed to create branch', err)
        throw toError(err, 'Failed to create branch')
    }
}

export async function checkoutBranch(
    projectPath: string,
    branchName: string,
    options: CheckoutBranchOptions = {}
): Promise<CheckoutBranchResult> {
    const queuePath = await resolveRepoQueuePath(projectPath)
    return enqueueRepoWrite(queuePath, 'checkout branch', async () => {
        assertNonEmpty(branchName, 'Branch name')
        const projectGit = createGit(projectPath)
        const repoContext = await getRepoContext(projectGit, projectPath).catch(() => null)
        const git = repoContext?.repoRoot
            ? createGit(repoContext.repoRoot)
            : projectGit
        const targetBranch = branchName.trim()
        const shouldAutoStash = options.autoStash !== false
        const shouldAutoCleanupLock = options.autoCleanupLock !== false
        let cleanedLock = false

        try {
            await git.checkout(targetBranch)
            return { stashed: false }
        } catch (err) {
            let checkoutError: unknown = err
            let message = toErrorMessage(err, 'Failed to checkout branch')

            if (isBranchPathspecNotFound(message)) {
                const remoteBranch = `origin/${targetBranch}`
                const remoteBranches = await git.branch(['-r']).catch(() => ({ all: [] as string[] }))
                const hasRemoteBranch = remoteBranches.all
                    .map((name) => name.trim())
                    .includes(remoteBranch)

                if (hasRemoteBranch) {
                    await git.checkout(['--track', remoteBranch])
                    return { stashed: false }
                }
            }

            if (shouldAutoCleanupLock && isGitIndexLockConflict(message)) {
                try {
                    const cleanupResult = await cleanupStaleIndexLock(projectPath)
                    if (cleanupResult === 'active') {
                        throw new Error(
                            'Git index is currently locked by another running Git process. Close other Git operations and try again.'
                        )
                    }

                    if (cleanupResult === 'removed') {
                        cleanedLock = true
                        await git.checkout(targetBranch)
                        return { stashed: false, cleanedLock: true }
                    }
                } catch (lockRecoveryErr) {
                    checkoutError = lockRecoveryErr
                    message = toErrorMessage(lockRecoveryErr, message)
                }
            }

            if (!shouldAutoStash || !isCheckoutBlockedByLocalChanges(message)) {
                log.error('Failed to checkout branch', checkoutError)
                throw toError(checkoutError, 'Failed to checkout branch')
            }

            try {
                const stashMessage = `Zyra auto-stash before switching to ${targetBranch} at ${new Date().toISOString()}`
                const beforeStashCount = (await git.stashList().catch(() => ({ total: 0 }))).total || 0

                await git.raw(['stash', 'push', '-u', '-m', stashMessage])
                await git.checkout(targetBranch)

                const afterStashCount = (await git.stashList().catch(() => ({ total: beforeStashCount }))).total || beforeStashCount
                const stashed = afterStashCount > beforeStashCount

                return {
                    stashed,
                    cleanedLock: cleanedLock || undefined,
                    stashRef: stashed ? 'stash@{0}' : undefined,
                    stashMessage: stashed ? stashMessage : undefined
                }
            } catch (autoStashErr) {
                log.error('Failed to checkout branch after auto-stash fallback', autoStashErr)
                throw toError(autoStashErr, `Failed to checkout branch: ${message}`)
            }
        }
    })
}

export async function deleteBranch(projectPath: string, branchName: string, force: boolean = false): Promise<void> {
    try {
        assertNonEmpty(branchName, 'Branch name')
        await withIndexLockRecovery(projectPath, 'delete branch', async (git) => {
            await git.deleteLocalBranch(branchName.trim(), force)
        })
    } catch (err) {
        log.error('Failed to delete branch', err)
        throw toError(err, 'Failed to delete branch')
    }
}

export async function listRemotes(projectPath: string): Promise<GitRemoteSummary[]> {
    try {
        const git = createGit(projectPath)
        const remotes = await git.getRemotes(true)
        return remotes.map((remote) => ({
            name: remote.name,
            fetchUrl: remote.refs.fetch,
            pushUrl: remote.refs.push
        }))
    } catch (err) {
        log.error('Failed to list remotes', err)
        throw toError(err, 'Failed to list remotes')
    }
}

export async function addRemote(projectPath: string, remoteName: string, remoteUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
        assertNonEmpty(remoteName, 'Remote name')
        assertNonEmpty(remoteUrl, 'Remote URL')
        await withIndexLockRecovery(projectPath, `add remote ${remoteName.trim()}`, async (git) => {
            const remotes = await git.getRemotes()
            if (remotes.some((remote) => remote.name === remoteName.trim())) {
                throw new Error(`Remote "${remoteName.trim()}" already exists`)
            }
            await git.addRemote(remoteName.trim(), remoteUrl.trim())
        })
        return { success: true }
    } catch (err: any) {
        log.error('Failed to add remote', err)
        return { success: false, error: err.message || 'Failed to add remote' }
    }
}

export async function addRemoteOrigin(projectPath: string, remoteUrl: string): Promise<{ success: boolean; error?: string }> {
    return addRemote(projectPath, 'origin', remoteUrl)
}

export async function setRemoteUrl(projectPath: string, remoteName: string, remoteUrl: string): Promise<void> {
    try {
        assertNonEmpty(remoteName, 'Remote name')
        assertNonEmpty(remoteUrl, 'Remote URL')
        await withIndexLockRecovery(projectPath, 'set remote URL', async (git) => {
            await git.remote(['set-url', remoteName.trim(), remoteUrl.trim()])
        })
    } catch (err) {
        log.error('Failed to set remote URL', err)
        throw toError(err, 'Failed to set remote URL')
    }
}

export async function removeRemote(projectPath: string, remoteName: string): Promise<void> {
    try {
        assertNonEmpty(remoteName, 'Remote name')
        await withIndexLockRecovery(projectPath, 'remove remote', async (git) => {
            await git.removeRemote(remoteName.trim())
        })
    } catch (err) {
        log.error('Failed to remove remote', err)
        throw toError(err, 'Failed to remove remote')
    }
}

export async function listTags(projectPath: string): Promise<GitTagSummary[]> {
    try {
        const git = createGit(projectPath)
        const result = await git.tags()
        return result.all.map((name) => ({ name }))
    } catch (err) {
        log.error('Failed to list tags', err)
        throw toError(err, 'Failed to list tags')
    }
}

export async function createTag(projectPath: string, tagName: string, target?: string): Promise<void> {
    try {
        assertNonEmpty(tagName, 'Tag name')
        await withIndexLockRecovery(projectPath, 'create tag', async (git) => {
            if (target?.trim()) {
                await git.raw(['tag', tagName.trim(), target.trim()])
            } else {
                await git.addTag(tagName.trim())
            }
        })
    } catch (err) {
        log.error('Failed to create tag', err)
        throw toError(err, 'Failed to create tag')
    }
}

export async function deleteTag(projectPath: string, tagName: string): Promise<void> {
    try {
        assertNonEmpty(tagName, 'Tag name')
        await withIndexLockRecovery(projectPath, 'delete tag', async (git) => {
            await git.raw(['tag', '-d', tagName.trim()])
        })
    } catch (err) {
        log.error('Failed to delete tag', err)
        throw toError(err, 'Failed to delete tag')
    }
}

export async function listStashes(projectPath: string): Promise<Array<{ hash: string; message: string }>> {
    try {
        const git = createGit(projectPath)
        const result = await git.stashList()
        return result.all.map((item) => ({ hash: item.hash, message: item.message }))
    } catch (err) {
        log.error('Failed to list stashes', err)
        throw toError(err, 'Failed to list stashes')
    }
}

export async function createStash(projectPath: string, message?: string): Promise<void> {
    try {
        await withIndexLockRecovery(projectPath, 'create stash', async (git) => {
            const args = ['push', '-u']
            if (message?.trim()) {
                args.push('-m', message.trim())
            }
            await git.raw(['stash', ...args])
        })
    } catch (err) {
        log.error('Failed to create stash', err)
        throw toError(err, 'Failed to create stash')
    }
}

export async function applyStash(projectPath: string, stashRef: string = 'stash@{0}', pop: boolean = false): Promise<void> {
    try {
        await withIndexLockRecovery(projectPath, 'apply stash', async (git) => {
            await git.raw(['stash', pop ? 'pop' : 'apply', stashRef])
        })
    } catch (err) {
        log.error('Failed to apply stash', err)
        throw toError(err, 'Failed to apply stash')
    }
}

export async function dropStash(projectPath: string, stashRef: string = 'stash@{0}'): Promise<void> {
    try {
        await withIndexLockRecovery(projectPath, 'drop stash', async (git) => {
            await git.raw(['stash', 'drop', stashRef])
        })
    } catch (err) {
        log.error('Failed to drop stash', err)
        throw toError(err, 'Failed to drop stash')
    }
}
