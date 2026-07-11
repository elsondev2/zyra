import { ipcRenderer } from 'electron'
import type {
    DevScopeGitCloneInput,
    DevScopeGitCloneProgressEvent,
    DevScopePreviewTerminalEvent,
    DevScopePythonPreviewEvent
} from '../../shared/contracts/devscope-api'
import { GIT_CLONE_PROGRESS_CHANNEL } from '../../shared/contracts/devscope-api'

export function createProjectsAdapter() {
    const PYTHON_PREVIEW_EVENT_CHANNEL = 'devscope:pythonPreview:event'
    const PREVIEW_TERMINAL_EVENT_CHANNEL = 'devscope:previewTerminal:event'

    return {
        selectFolder: () => ipcRenderer.invoke('devscope:selectFolder'),
        selectMarkdownFile: () => ipcRenderer.invoke('devscope:selectMarkdownFile'),
        getUserHomePath: () => ipcRenderer.invoke('devscope:getUserHomePath'),
        listInstalledPackageRuntimes: () => ipcRenderer.invoke('devscope:listInstalledPackageRuntimes'),
        scanProjects: (folderPath: string, options?: { forceRefresh?: boolean }) =>
            ipcRenderer.invoke('devscope:scanProjects', folderPath, options),
        openInExplorer: (path: string) => ipcRenderer.invoke('devscope:openInExplorer', path),
        openInTerminal: (path: string, preferredShell: 'powershell' | 'cmd' = 'powershell', initialCommand?: string) =>
            ipcRenderer.invoke('devscope:openInTerminal', path, preferredShell, initialCommand),
        listInstalledIdes: () => ipcRenderer.invoke('devscope:listInstalledIdes'),
        openProjectInIde: (projectPath: string, ideId: string) =>
            ipcRenderer.invoke('devscope:openProjectInIde', projectPath, ideId),
        installProjectDependencies: (projectPath: string, options?: { onlyMissing?: boolean }) =>
            ipcRenderer.invoke('devscope:installProjectDependencies', projectPath, options),
        getProjectDetails: (projectPath: string) => ipcRenderer.invoke('devscope:getProjectDetails', projectPath),
        getFileTree: (
            projectPath: string,
            options?: {
                showHidden?: boolean
                maxDepth?: number
                rootPath?: string
                includeGitStatus?: boolean
                includeFileSize?: boolean
            }
        ) =>
            ipcRenderer.invoke('devscope:getFileTree', projectPath, options),
        getGitHistory: (projectPath: string, limit?: number, options?: { all?: boolean; includeStats?: boolean }) =>
            ipcRenderer.invoke('devscope:getGitHistory', projectPath, limit, options),
        getGitHistoryCount: (projectPath: string, options?: { all?: boolean }) =>
            ipcRenderer.invoke('devscope:getGitHistoryCount', projectPath, options),
        getGitCommitStats: (projectPath: string, commitHashes: string[]) =>
            ipcRenderer.invoke('devscope:getGitCommitStats', projectPath, commitHashes),
        getCommitDiff: (projectPath: string, commitHash: string) => ipcRenderer.invoke('devscope:getCommitDiff', projectPath, commitHash),
        getWorkingDiff: (
            projectPath: string,
            filePath?: string,
            mode?: 'combined' | 'staged' | 'unstaged'
        ) => ipcRenderer.invoke('devscope:getWorkingDiff', projectPath, filePath, mode),
        getWorkingChangesForAI: (projectPath: string) => ipcRenderer.invoke('devscope:getWorkingChangesForAI', projectPath),
        getGitStatus: (projectPath: string) => ipcRenderer.invoke('devscope:getGitStatus', projectPath),
        getGitStatusDetailed: (projectPath: string, options?: { includeStats?: boolean }) =>
            ipcRenderer.invoke('devscope:getGitStatusDetailed', projectPath, options),
        getGitStatusEntryStats: (projectPath: string, filePaths: string[]) =>
            ipcRenderer.invoke('devscope:getGitStatusEntryStats', projectPath, filePaths),
        getGitSyncStatus: (projectPath: string) => ipcRenderer.invoke('devscope:getGitSyncStatus', projectPath),
        getIncomingCommits: (projectPath: string, limit?: number) =>
            ipcRenderer.invoke('devscope:getIncomingCommits', projectPath, limit),
        getUnpushedCommits: (projectPath: string) => ipcRenderer.invoke('devscope:getUnpushedCommits', projectPath),
        getGitUser: (projectPath: string) => ipcRenderer.invoke('devscope:getGitUser', projectPath),
        getGlobalGitUser: () => ipcRenderer.invoke('devscope:getGlobalGitUser'),
        getRepoOwner: (projectPath: string) => ipcRenderer.invoke('devscope:getRepoOwner', projectPath),
        getGitHubPublishContext: (projectPath: string) =>
            ipcRenderer.invoke('devscope:getGitHubPublishContext', projectPath),
        getCurrentBranchPullRequest: (projectPath: string) =>
            ipcRenderer.invoke('devscope:getCurrentBranchPullRequest', projectPath),
        createOrOpenPullRequest: (
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
        ) => ipcRenderer.invoke('devscope:createOrOpenPullRequest', projectPath, input),
        commitPushAndCreatePullRequest: (
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
        ) => ipcRenderer.invoke('devscope:commitPushAndCreatePullRequest', projectPath, input),
        hasRemoteOrigin: (projectPath: string) => ipcRenderer.invoke('devscope:hasRemoteOrigin', projectPath),
        getProjectsGitOverview: (projectPaths: string[]) => ipcRenderer.invoke('devscope:getProjectsGitOverview', projectPaths),
        stageFiles: (
            projectPath: string,
            files: string[],
            options?: { scope?: 'project' | 'repo' }
        ) => ipcRenderer.invoke('devscope:stageFiles', projectPath, files, options),
        unstageFiles: (
            projectPath: string,
            files: string[],
            options?: { scope?: 'project' | 'repo' }
        ) => ipcRenderer.invoke('devscope:unstageFiles', projectPath, files, options),
        discardChanges: (
            projectPath: string,
            files: string[],
            options?: { scope?: 'project' | 'repo'; mode?: 'unstaged' | 'staged' | 'both' }
        ) => ipcRenderer.invoke('devscope:discardChanges', projectPath, files, options),
        createCommit: (projectPath: string, message: string) => ipcRenderer.invoke('devscope:createCommit', projectPath, message),
        setGlobalGitUser: (user: { name: string; email: string }) => ipcRenderer.invoke('devscope:setGlobalGitUser', user),
        pushCommits: (projectPath: string, options?: { remoteName?: string; branchName?: string }) =>
            ipcRenderer.invoke('devscope:pushCommits', projectPath, options),
        pushSingleCommit: (projectPath: string, commitHash: string, options?: { remoteName?: string; branchName?: string }) =>
            ipcRenderer.invoke('devscope:pushSingleCommit', projectPath, commitHash, options),
        fetchUpdates: (projectPath: string, remoteName?: string) => ipcRenderer.invoke('devscope:fetchUpdates', projectPath, remoteName),
        pullUpdates: (
            projectPath: string,
            options?: { remoteName?: string; branchName?: string; pushRemoteName?: string }
        ) => ipcRenderer.invoke('devscope:pullUpdates', projectPath, options),
        listBranches: (projectPath: string) => ipcRenderer.invoke('devscope:listBranches', projectPath),
        createBranch: (projectPath: string, branchName: string, checkout?: boolean) =>
            ipcRenderer.invoke('devscope:createBranch', projectPath, branchName, checkout),
        checkoutBranch: (
            projectPath: string,
            branchName: string,
            options?: { autoStash?: boolean; autoCleanupLock?: boolean }
        ) =>
            ipcRenderer.invoke('devscope:checkoutBranch', projectPath, branchName, options),
        deleteBranch: (projectPath: string, branchName: string, force?: boolean) =>
            ipcRenderer.invoke('devscope:deleteBranch', projectPath, branchName, force),
        addRemote: (projectPath: string, remoteName: string, remoteUrl: string) =>
            ipcRenderer.invoke('devscope:addRemote', projectPath, remoteName, remoteUrl),
        listRemotes: (projectPath: string) => ipcRenderer.invoke('devscope:listRemotes', projectPath),
        setRemoteUrl: (projectPath: string, remoteName: string, remoteUrl: string) =>
            ipcRenderer.invoke('devscope:setRemoteUrl', projectPath, remoteName, remoteUrl),
        removeRemote: (projectPath: string, remoteName: string) => ipcRenderer.invoke('devscope:removeRemote', projectPath, remoteName),
        listTags: (projectPath: string) => ipcRenderer.invoke('devscope:listTags', projectPath),
        createTag: (projectPath: string, tagName: string, target?: string) =>
            ipcRenderer.invoke('devscope:createTag', projectPath, tagName, target),
        deleteTag: (projectPath: string, tagName: string) => ipcRenderer.invoke('devscope:deleteTag', projectPath, tagName),
        listStashes: (projectPath: string) => ipcRenderer.invoke('devscope:listStashes', projectPath),
        createStash: (projectPath: string, message?: string) => ipcRenderer.invoke('devscope:createStash', projectPath, message),
        applyStash: (projectPath: string, stashRef?: string, pop?: boolean) =>
            ipcRenderer.invoke('devscope:applyStash', projectPath, stashRef, pop),
        dropStash: (projectPath: string, stashRef?: string) => ipcRenderer.invoke('devscope:dropStash', projectPath, stashRef),
        checkIsGitRepo: (projectPath: string) => ipcRenderer.invoke('devscope:checkIsGitRepo', projectPath),
        initGitRepo: (projectPath: string, branchName: string, createGitignore: boolean, gitignoreTemplate?: string) =>
            ipcRenderer.invoke('devscope:initGitRepo', projectPath, branchName, createGitignore, gitignoreTemplate),
        createInitialCommit: (projectPath: string, message: string) => ipcRenderer.invoke('devscope:createInitialCommit', projectPath, message),
        addRemoteOrigin: (projectPath: string, remoteUrl: string) => ipcRenderer.invoke('devscope:addRemoteOrigin', projectPath, remoteUrl),
        cloneGitRepository: (input: DevScopeGitCloneInput) => ipcRenderer.invoke('devscope:cloneGitRepository', input),
        onGitCloneProgress: (callback: (event: DevScopeGitCloneProgressEvent) => void) => {
            const listener = (_event: Electron.IpcRendererEvent, payload: DevScopeGitCloneProgressEvent) => {
                callback(payload)
            }
            ipcRenderer.on(GIT_CLONE_PROGRESS_CHANNEL, listener)
            return () => {
                ipcRenderer.removeListener(GIT_CLONE_PROGRESS_CHANNEL, listener)
            }
        },
        getGitignoreTemplates: () => ipcRenderer.invoke('devscope:getGitignoreTemplates'),
        generateGitignoreContent: (template: string) => ipcRenderer.invoke('devscope:generateGitignoreContent', template),
        getGitignorePatterns: () => ipcRenderer.invoke('devscope:getGitignorePatterns'),
        generateCustomGitignoreContent: (selectedPatternIds: string[]) => ipcRenderer.invoke('devscope:generateCustomGitignoreContent', selectedPatternIds),
        copyToClipboard: (text: string) => ipcRenderer.invoke('devscope:copyToClipboard', text),
        readFileContent: (filePath: string) => ipcRenderer.invoke('devscope:readFileContent', filePath),
        readTextFileFull: (filePath: string) => ipcRenderer.invoke('devscope:readTextFileFull', filePath),
        getPathInfo: (targetPath: string) => ipcRenderer.invoke('devscope:getPathInfo', targetPath),
        writeTextFile: (filePath: string, content: string, expectedModifiedAt?: number) =>
            ipcRenderer.invoke('devscope:writeTextFile', filePath, content, expectedModifiedAt),
        runPythonPreview: (input: { sessionId: string; filePath: string; projectPath?: string }) =>
            ipcRenderer.invoke('devscope:pythonPreview:run', input),
        stopPythonPreview: (sessionId: string) =>
            ipcRenderer.invoke('devscope:pythonPreview:stop', sessionId),
        onPythonPreviewEvent: (callback: (event: DevScopePythonPreviewEvent) => void) => {
            const listener = (_event: Electron.IpcRendererEvent, payload: DevScopePythonPreviewEvent) => {
                callback(payload)
            }
            ipcRenderer.on(PYTHON_PREVIEW_EVENT_CHANNEL, listener)
            return () => {
                ipcRenderer.removeListener(PYTHON_PREVIEW_EVENT_CHANNEL, listener)
            }
        },
        createPreviewTerminal: (input: {
            sessionId: string
            targetPath?: string
            preferredShell?: 'powershell' | 'cmd'
            cols?: number
            rows?: number
            title?: string
        }) => ipcRenderer.invoke('devscope:previewTerminal:create', input),
        listPreviewTerminalSessions: (input?: { targetPath?: string }) =>
            ipcRenderer.invoke('devscope:previewTerminal:list', input),
        writePreviewTerminal: (input: { sessionId: string; data: string }) =>
            ipcRenderer.invoke('devscope:previewTerminal:write', input),
        setPreviewTerminalTitle: (input: { sessionId: string; title: string }) =>
            ipcRenderer.invoke('devscope:previewTerminal:setTitle', input),
        resizePreviewTerminal: (input: { sessionId: string; cols: number; rows: number }) =>
            ipcRenderer.invoke('devscope:previewTerminal:resize', input),
        closePreviewTerminal: (sessionId: string) =>
            ipcRenderer.invoke('devscope:previewTerminal:close', sessionId),
        onPreviewTerminalEvent: (callback: (event: DevScopePreviewTerminalEvent) => void) => {
            const listener = (_event: Electron.IpcRendererEvent, payload: DevScopePreviewTerminalEvent) => {
                callback(payload)
            }
            ipcRenderer.on(PREVIEW_TERMINAL_EVENT_CHANNEL, listener)
            return () => {
                ipcRenderer.removeListener(PREVIEW_TERMINAL_EVENT_CHANNEL, listener)
            }
        },
        openFile: (filePath: string) => ipcRenderer.invoke('devscope:openFile', filePath),
        openWith: (filePath: string) => ipcRenderer.invoke('devscope:openWith', filePath),
        createFileSystemItem: (destinationDirectory: string, name: string, type: 'file' | 'directory') =>
            ipcRenderer.invoke('devscope:createFileSystemItem', destinationDirectory, name, type),
        renameFileSystemItem: (targetPath: string, nextName: string) =>
            ipcRenderer.invoke('devscope:renameFileSystemItem', targetPath, nextName),
        deleteFileSystemItem: (targetPath: string) => ipcRenderer.invoke('devscope:deleteFileSystemItem', targetPath),
        pasteFileSystemItem: (sourcePath: string, destinationDirectory: string) =>
            ipcRenderer.invoke('devscope:pasteFileSystemItem', sourcePath, destinationDirectory),
        moveFileSystemItem: (sourcePath: string, destinationDirectory: string) =>
            ipcRenderer.invoke('devscope:moveFileSystemItem', sourcePath, destinationDirectory),
        getProjectSessions: (_projectPath: string) => Promise.resolve({ success: true, sessions: [] }),
        getProjectProcesses: (projectPath: string) => ipcRenderer.invoke('devscope:getProjectProcesses', projectPath),
        indexAllFolders: (folders: string[], options?: { forceRefresh?: boolean }) =>
            ipcRenderer.invoke('devscope:indexAllFolders', folders, options),
        searchIndexedPaths: (input: {
            scopePath?: string
            roots?: string[]
            term?: string
            extensionFilters?: string[]
            limit?: number
            includeFiles?: boolean
            includeDirectories?: boolean
            showHidden?: boolean
        }) => ipcRenderer.invoke('devscope:searchIndexedPaths', input),
        getFileSystemRoots: () => ipcRenderer.invoke('devscope:getFileSystemRoots')
    }
}
