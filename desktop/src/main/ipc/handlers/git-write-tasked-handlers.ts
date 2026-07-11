import log from 'electron-log'
import {
    addRemote,
    addRemoteOrigin,
    createCommit,
    fetchUpdates,
    initGitRepo,
    pullUpdates,
    pushCommits,
    pushSingleCommit
} from '../../inspectors/git'
import { createOrOpenPullRequest, logPullRequestError } from '../../services/github-pull-request'
import { commitPushAndCreatePullRequest } from '../../services/git-stacked-pull-request'

export async function handleCreateCommit(_event: Electron.IpcMainInvokeEvent, projectPath: string, message: string) {
    try {
        await createCommit(projectPath, message)
        return { success: true }
    } catch (err: any) {
        log.error('Failed to create commit:', err)
        return { success: false, error: err?.message || 'Failed to create commit.' }
    }
}

export async function handlePushCommits(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    options?: { remoteName?: string; branchName?: string }
) {
    try {
        await pushCommits(projectPath, options)
        return { success: true }
    } catch (err: any) {
        log.error('Failed to push commits:', err)
        return { success: false, error: err?.message || 'Failed to push commits.' }
    }
}

export async function handlePushSingleCommit(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    commitHash: string,
    options?: { remoteName?: string; branchName?: string }
) {
    try {
        await pushSingleCommit(projectPath, commitHash, options)
        return { success: true }
    } catch (err: any) {
        log.error('Failed to push single commit:', err)
        return { success: false, error: err?.message || 'Failed to push single commit.' }
    }
}

export async function handleCreateOrOpenPullRequest(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    input: {
        projectName?: string
        targetBranch?: string
        draft?: boolean
        title?: string
        body?: string
        guideText?: string
        provider?: 'groq' | 'gemini' | 'codex'
        apiKey?: string
        model?: string
    }
) {
    try {
        const result = await createOrOpenPullRequest(projectPath, input || {})
        return { success: true, ...result }
    } catch (err: any) {
        const normalized = logPullRequestError('failed to create or open pull request', err)
        return { success: false, error: normalized.message }
    }
}

export async function handleCommitPushAndCreatePullRequest(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    input: {
        projectName?: string
        commitMessage?: string
        targetBranch?: string
        draft?: boolean
        guideText?: string
        provider?: 'groq' | 'gemini' | 'codex'
        apiKey?: string
        model?: string
        autoStageAll?: boolean
        stageScope?: 'project' | 'repo'
    }
) {
    try {
        const result = await commitPushAndCreatePullRequest(projectPath, input || {})
        return { success: true, ...result }
    } catch (err: any) {
        const normalized = logPullRequestError('failed to run commit/push/pr flow', err)
        return { success: false, error: normalized.message }
    }
}

export async function handleFetchUpdates(_event: Electron.IpcMainInvokeEvent, projectPath: string, remoteName?: string) {
    try {
        await fetchUpdates(projectPath, remoteName)
        return { success: true }
    } catch (err: any) {
        log.error('Failed to fetch updates:', err)
        return { success: false, error: err?.message || 'Failed to fetch updates.' }
    }
}

export async function handlePullUpdates(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    options?: { remoteName?: string; branchName?: string; pushRemoteName?: string }
) {
    try {
        await pullUpdates(projectPath, options)
        return { success: true }
    } catch (err: any) {
        log.error('Failed to pull updates:', err)
        return { success: false, error: err?.message || 'Failed to pull updates.' }
    }
}

export async function handleAddRemote(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    remoteName: string,
    remoteUrl: string
) {
    try {
        return await addRemote(projectPath, remoteName, remoteUrl)
    } catch (err: any) {
        log.error('Failed to add remote:', err)
        return { success: false, error: err?.message || `Failed to add remote ${remoteName}.` }
    }
}

export async function handleInitGitRepo(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    branchName: string,
    createGitignore: boolean,
    gitignoreTemplate?: string
) {
    try {
        return await initGitRepo(projectPath, branchName, createGitignore, gitignoreTemplate)
    } catch (err: any) {
        log.error('Failed to init git repo:', err)
        return { success: false, error: err?.message || 'Failed to initialize repository.' }
    }
}

export async function handleAddRemoteOrigin(_event: Electron.IpcMainInvokeEvent, projectPath: string, remoteUrl: string) {
    try {
        return await addRemoteOrigin(projectPath, remoteUrl)
    } catch (err: any) {
        log.error('Failed to add remote origin:', err)
        return { success: false, error: err?.message || 'Failed to add remote origin.' }
    }
}
