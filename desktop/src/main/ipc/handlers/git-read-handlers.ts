import log from 'electron-log'
import {
    checkIsGitRepo,
    generateCustomGitignoreContent,
    generateGitignoreContent,
    getCommitDiff,
    getGitCommitStats,
    getGitHistory,
    getGitHistoryCount,
    getGitStatusEntryStats,
    getGitSyncStatus,
    getGitStatus,
    getGitStatusDetailed,
    getGlobalGitUser,
    getGitUser,
    getGitignorePatterns,
    getGitignoreTemplates,
    getIncomingCommits,
    getProjectsGitOverview as getProjectsGitOverviewBatch,
    getRepoOwner,
    getUnpushedCommits,
    getWorkingChangesForAI,
    getWorkingDiff,
    hasRemoteOrigin
} from '../../inspectors/git'
import { getGitHubPublishContext } from '../../services/github-publish'
import { getCurrentBranchPullRequest, logPullRequestError } from '../../services/github-pull-request'

export async function handleGetGitHistory(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    limit?: number,
    options?: { all?: boolean; includeStats?: boolean }
) {
    try {
        const result = await getGitHistory(projectPath, limit, options)
        return { success: true, ...result }
    } catch (err: any) {
        log.error('Failed to get git history:', err)
        return { success: false, error: err.message }
    }
}

export async function handleGetGitHistoryCount(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    options?: { all?: boolean }
) {
    try {
        const result = await getGitHistoryCount(projectPath, options)
        return { success: true, ...result }
    } catch (err: any) {
        log.error('Failed to get git history count:', err)
        return { success: false, error: err.message }
    }
}

export async function handleGetCommitDiff(_event: Electron.IpcMainInvokeEvent, projectPath: string, commitHash: string) {
    try {
        const diff = await getCommitDiff(projectPath, commitHash)
        return { success: true, diff }
    } catch (err: any) {
        log.error('Failed to get commit diff:', err)
        return { success: false, error: err.message }
    }
}

export async function handleGetWorkingDiff(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    filePath?: string,
    mode: 'combined' | 'staged' | 'unstaged' = 'combined'
) {
    try {
        const diff = await getWorkingDiff(projectPath, filePath, mode)
        return { success: true, diff }
    } catch (err: any) {
        log.error('Failed to get working diff:', err)
        return { success: false, error: err.message }
    }
}

export async function handleGetWorkingChangesForAI(_event: Electron.IpcMainInvokeEvent, projectPath: string) {
    try {
        const context = await getWorkingChangesForAI(projectPath)
        return { success: true, context }
    } catch (err: any) {
        log.error('Failed to get working changes context for AI:', err)
        return { success: false, error: err.message }
    }
}

export async function handleGetGitStatus(_event: Electron.IpcMainInvokeEvent, projectPath: string) {
    try {
        const status = await getGitStatus(projectPath)
        return { success: true, status }
    } catch (err: any) {
        log.error('Failed to get git status:', err)
        return { success: false, error: err.message }
    }
}

export async function handleGetGitStatusDetailed(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    options?: { includeStats?: boolean }
) {
    try {
        const entries = await getGitStatusDetailed(projectPath, options)
        return { success: true, entries }
    } catch (err: any) {
        log.error('Failed to get detailed git status:', err)
        return { success: false, error: err.message }
    }
}

export async function handleGetUnpushedCommits(_event: Electron.IpcMainInvokeEvent, projectPath: string) {
    try {
        const commits = await getUnpushedCommits(projectPath)
        return { success: true, commits }
    } catch (err: any) {
        log.error('Failed to get unpushed commits:', err)
        return { success: false, error: err.message }
    }
}

export async function handleGetGitUser(_event: Electron.IpcMainInvokeEvent, projectPath: string) {
    try {
        const user = await getGitUser(projectPath)
        return { success: true, user }
    } catch (err: any) {
        log.error('Failed to get git user:', err)
        return { success: false, error: err.message }
    }
}

export async function handleGetGitStatusEntryStats(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    filePaths: string[]
) {
    try {
        const entries = await getGitStatusEntryStats(projectPath, filePaths)
        return { success: true, entries }
    } catch (err: any) {
        log.error('Failed to get git status entry stats:', err)
        return { success: false, error: err.message }
    }
}

export async function handleGetGitCommitStats(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    commitHashes: string[]
) {
    try {
        const commits = await getGitCommitStats(projectPath, commitHashes)
        return { success: true, commits }
    } catch (err: any) {
        log.error('Failed to get git commit stats:', err)
        return { success: false, error: err.message }
    }
}

export async function handleGetIncomingCommits(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    limit?: number
) {
    try {
        const commits = await getIncomingCommits(projectPath, limit)
        return { success: true, commits }
    } catch (err: any) {
        log.error('Failed to get incoming commits:', err)
        return { success: false, error: err.message }
    }
}

export async function handleGetGlobalGitUser() {
    try {
        const user = await getGlobalGitUser()
        return { success: true, user }
    } catch (err: any) {
        log.error('Failed to get global git user:', err)
        return { success: false, error: err.message }
    }
}

export async function handleGetRepoOwner(_event: Electron.IpcMainInvokeEvent, projectPath: string) {
    try {
        const owner = await getRepoOwner(projectPath)
        return { success: true, owner }
    } catch (err: any) {
        log.error('Failed to get repo owner:', err)
        return { success: false, error: err.message }
    }
}

export async function handleGetGitHubPublishContext(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string
) {
    try {
        const context = await getGitHubPublishContext(projectPath)
        return { success: true, context }
    } catch (err: any) {
        log.error('Failed to get GitHub publish context:', err)
        return { success: false, error: err.message }
    }
}

export async function handleGetCurrentBranchPullRequest(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string
) {
    try {
        const pullRequest = await getCurrentBranchPullRequest(projectPath)
        return { success: true, pullRequest }
    } catch (err: any) {
        const normalized = logPullRequestError('failed to read current branch pull request', err)
        return { success: false, error: normalized.message }
    }
}

export async function handleHasRemoteOrigin(_event: Electron.IpcMainInvokeEvent, projectPath: string) {
    try {
        const hasRemote = await hasRemoteOrigin(projectPath)
        return { success: true, hasRemote }
    } catch (err: any) {
        log.error('Failed to check remote origin:', err)
        return { success: false, error: err.message }
    }
}

export async function handleGetGitSyncStatus(_event: Electron.IpcMainInvokeEvent, projectPath: string) {
    try {
        const sync = await getGitSyncStatus(projectPath)
        return { success: true, sync }
    } catch (err: any) {
        log.error('Failed to get git sync status:', err)
        return { success: false, error: err.message }
    }
}

export async function handleGetProjectsGitOverview(_event: Electron.IpcMainInvokeEvent, projectPaths: string[]) {
    try {
        const items = await getProjectsGitOverviewBatch(projectPaths)
        return { success: true, items }
    } catch (err: any) {
        log.error('Failed to get project git overview:', err)
        return { success: false, error: err.message }
    }
}

export async function handleCheckIsGitRepo(_event: Electron.IpcMainInvokeEvent, projectPath: string) {
    try {
        const isGitRepo = await checkIsGitRepo(projectPath)
        return { success: true, isGitRepo }
    } catch (err: any) {
        log.error('Failed to check git repo:', err)
        return { success: false, error: err.message }
    }
}

export async function handleGetGitignoreTemplates() {
    try {
        const templates = getGitignoreTemplates()
        return { success: true, templates }
    } catch (err: any) {
        log.error('Failed to get gitignore templates:', err)
        return { success: false, error: err.message }
    }
}

export async function handleGenerateGitignoreContent(_event: Electron.IpcMainInvokeEvent, template: string) {
    try {
        const content = generateGitignoreContent(template)
        return { success: true, content }
    } catch (err: any) {
        log.error('Failed to generate gitignore content:', err)
        return { success: false, error: err.message }
    }
}

export async function handleGetGitignorePatterns() {
    try {
        const patterns = getGitignorePatterns()
        return { success: true, patterns }
    } catch (err: any) {
        log.error('Failed to get gitignore patterns:', err)
        return { success: false, error: err.message }
    }
}

export async function handleGenerateCustomGitignoreContent(_event: Electron.IpcMainInvokeEvent, selectedPatternIds: string[]) {
    try {
        const content = generateCustomGitignoreContent(selectedPatternIds)
        return { success: true, content }
    } catch (err: any) {
        log.error('Failed to generate custom gitignore content:', err)
        return { success: false, error: err.message }
    }
}
