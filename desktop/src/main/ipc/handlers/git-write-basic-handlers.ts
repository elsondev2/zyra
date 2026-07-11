import log from 'electron-log'
import {
    GIT_CLONE_PROGRESS_CHANNEL,
    type DevScopeGitCloneInput,
    type DevScopeGitCloneProgressEvent
} from '../../../shared/contracts/devscope-api'
import { cloneGitRepository } from '../../services/git-clone-service'
import {
    applyStash,
    checkoutBranch,
    createBranch,
    createInitialCommit,
    createStash,
    createTag,
    deleteBranch,
    deleteTag,
    discardChanges,
    dropStash,
    listBranches,
    listRemotes,
    listStashes,
    listTags,
    removeRemote,
    setGlobalGitUser,
    setRemoteUrl,
    stageFiles,
    unstageFiles
} from '../../inspectors/git'

export async function handleStageFiles(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    files: string[],
    options?: { scope?: 'project' | 'repo' }
) {
    try {
        await stageFiles(projectPath, files, options)
        return { success: true }
    } catch (err: any) {
        log.error('Failed to stage files:', err)
        return { success: false, error: err.message }
    }
}

export async function handleUnstageFiles(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    files: string[],
    options?: { scope?: 'project' | 'repo' }
) {
    try {
        await unstageFiles(projectPath, files, options)
        return { success: true }
    } catch (err: any) {
        log.error('Failed to unstage files:', err)
        return { success: false, error: err.message }
    }
}

export async function handleDiscardChanges(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    files: string[],
    options?: { scope?: 'project' | 'repo'; mode?: 'unstaged' | 'staged' | 'both' }
) {
    try {
        await discardChanges(projectPath, files, options)
        return { success: true }
    } catch (err: any) {
        log.error('Failed to discard changes:', err)
        return { success: false, error: err.message }
    }
}

export async function handleSetGlobalGitUser(
    _event: Electron.IpcMainInvokeEvent,
    user: { name: string; email: string }
) {
    try {
        await setGlobalGitUser(user?.name || '', user?.email || '')
        return { success: true }
    } catch (err: any) {
        log.error('Failed to set global git user:', err)
        return { success: false, error: err.message }
    }
}

export async function handleListBranches(_event: Electron.IpcMainInvokeEvent, projectPath: string) {
    try {
        const branches = await listBranches(projectPath)
        return { success: true, branches }
    } catch (err: any) {
        log.error('Failed to list branches:', err)
        return { success: false, error: err.message }
    }
}

export async function handleCreateBranch(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    branchName: string,
    checkout: boolean = true
) {
    try {
        await createBranch(projectPath, branchName, checkout)
        return { success: true }
    } catch (err: any) {
        log.error('Failed to create branch:', err)
        return { success: false, error: err.message }
    }
}

export async function handleCheckoutBranch(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    branchName: string,
    options?: { autoStash?: boolean; autoCleanupLock?: boolean }
) {
    try {
        const result = await checkoutBranch(projectPath, branchName, options)
        return { success: true, ...result }
    } catch (err: any) {
        log.error('Failed to checkout branch:', err)
        return { success: false, error: err.message }
    }
}

export async function handleDeleteBranch(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    branchName: string,
    force: boolean = false
) {
    try {
        await deleteBranch(projectPath, branchName, force)
        return { success: true }
    } catch (err: any) {
        log.error('Failed to delete branch:', err)
        return { success: false, error: err.message }
    }
}

export async function handleListRemotes(_event: Electron.IpcMainInvokeEvent, projectPath: string) {
    try {
        const remotes = await listRemotes(projectPath)
        return { success: true, remotes }
    } catch (err: any) {
        log.error('Failed to list remotes:', err)
        return { success: false, error: err.message }
    }
}

export async function handleSetRemoteUrl(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    remoteName: string,
    remoteUrl: string
) {
    try {
        await setRemoteUrl(projectPath, remoteName, remoteUrl)
        return { success: true }
    } catch (err: any) {
        log.error('Failed to set remote URL:', err)
        return { success: false, error: err.message }
    }
}

export async function handleRemoveRemote(_event: Electron.IpcMainInvokeEvent, projectPath: string, remoteName: string) {
    try {
        await removeRemote(projectPath, remoteName)
        return { success: true }
    } catch (err: any) {
        log.error('Failed to remove remote:', err)
        return { success: false, error: err.message }
    }
}

export async function handleListTags(_event: Electron.IpcMainInvokeEvent, projectPath: string) {
    try {
        const tags = await listTags(projectPath)
        return { success: true, tags }
    } catch (err: any) {
        log.error('Failed to list tags:', err)
        return { success: false, error: err.message }
    }
}

export async function handleCreateTag(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    tagName: string,
    target?: string
) {
    try {
        await createTag(projectPath, tagName, target)
        return { success: true }
    } catch (err: any) {
        log.error('Failed to create tag:', err)
        return { success: false, error: err.message }
    }
}

export async function handleDeleteTag(_event: Electron.IpcMainInvokeEvent, projectPath: string, tagName: string) {
    try {
        await deleteTag(projectPath, tagName)
        return { success: true }
    } catch (err: any) {
        log.error('Failed to delete tag:', err)
        return { success: false, error: err.message }
    }
}

export async function handleListStashes(_event: Electron.IpcMainInvokeEvent, projectPath: string) {
    try {
        const stashes = await listStashes(projectPath)
        return { success: true, stashes }
    } catch (err: any) {
        log.error('Failed to list stashes:', err)
        return { success: false, error: err.message }
    }
}

export async function handleCreateStash(_event: Electron.IpcMainInvokeEvent, projectPath: string, message?: string) {
    try {
        await createStash(projectPath, message)
        return { success: true }
    } catch (err: any) {
        log.error('Failed to create stash:', err)
        return { success: false, error: err.message }
    }
}

export async function handleApplyStash(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    stashRef?: string,
    pop?: boolean
) {
    try {
        await applyStash(projectPath, stashRef, pop)
        return { success: true }
    } catch (err: any) {
        log.error('Failed to apply stash:', err)
        return { success: false, error: err.message }
    }
}

export async function handleDropStash(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    stashRef?: string
) {
    try {
        await dropStash(projectPath, stashRef)
        return { success: true }
    } catch (err: any) {
        log.error('Failed to drop stash:', err)
        return { success: false, error: err.message }
    }
}

export async function handleCreateInitialCommit(_event: Electron.IpcMainInvokeEvent, projectPath: string, message: string) {
    try {
        const result = await createInitialCommit(projectPath, message)
        return result
    } catch (err: any) {
        log.error('Failed to create initial commit:', err)
        return { success: false, error: err.message }
    }
}

export async function handleCloneGitRepository(
    event: Electron.IpcMainInvokeEvent,
    input: DevScopeGitCloneInput
) {
    const cloneId = String(input?.cloneId || '').trim()
    const sendProgress = (update: Omit<DevScopeGitCloneProgressEvent, 'cloneId'>) => {
        if (event.sender.isDestroyed()) return
        event.sender.send(GIT_CLONE_PROGRESS_CHANNEL, {
            cloneId,
            ...update
        })
    }

    try {
        const result = await cloneGitRepository(input, (update) => {
            sendProgress(update)
        })
        return { success: true, ...result }
    } catch (err: any) {
        log.error('Failed to clone git repository:', err)
        if (cloneId) {
            sendProgress({
                status: 'error',
                message: err.message || 'Failed to clone repository.',
                error: err.message || 'Failed to clone repository.'
            })
        }
        return { success: false, error: err.message || 'Failed to clone repository.' }
    }
}
