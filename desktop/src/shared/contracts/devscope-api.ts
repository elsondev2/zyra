import type {
    AssistantApprovalResponseInput,
    AssistantAccountOverviewPayload,
    AssistantApprovePendingPlaygroundLabRequestInput,
    AssistantAttachSessionToPlaygroundLabInput,
    AssistantBootstrapPayload,
    AssistantClearLogsInput,
    AssistantConnectOptions,
    AssistantCreatePlaygroundLabInput,
    AssistantCreateSessionInput,
    AssistantDeclinePendingPlaygroundLabRequestInput,
    AssistantDeletePlaygroundLabInput,
    AssistantDeleteMessageInput,
    AssistantEventStreamPayload,
    AssistantFleetOperationResultPayload,
    AssistantFleetSnapshotPayload,
    AssistantGetHistoryPageInput,
    AssistantGetReviewIndexInput,
    AssistantGetSessionTurnUsageInput,
    AssistantGetTurnDetailInput,
    AssistantModelInfo,
    AssistantPlaygroundResultPayload,
    AssistantPersistClipboardImageInput,
    AssistantRealtimeVoiceEvent,
    AssistantReviewIndexResultPayload,
    AssistantRuntimeStatus,
    AssistantSearchTurnsInput,
    AssistantSearchTurnsResultPayload,
    AssistantSendPromptOptions,
    AssistantSelectThreadInput,
    AssistantStartRealtimeVoiceInput,
    AssistantSetPlaygroundRootInput,
    AssistantSessionTurnUsageResultPayload,
    AssistantShellSnapshot,
    AssistantSnapshot,
    AssistantThreadDetailResultPayload,
    AssistantHistoryPageResultPayload,
    AssistantTurnDetailResultPayload,
    AssistantTranscribeAudioInput,
    AssistantTranscriptionModelState,
    AssistantUserInputResponseInput,
    FleetOperationInput
} from '../assistant/contracts'
import type {
    DevScopeGitBranchSummary,
    DevScopeGitCommit,
    DevScopeGitFileStatus,
    DevScopeGitHistoryCount,
    DevScopeGitHubPublishContext,
    DevScopeGitRemoteSummary,
    DevScopeGitStashSummary,
    DevScopeGitStatusDetail,
    DevScopeGitStatusEntryStats,
    DevScopeGitSyncStatus,
    DevScopeGitTagSummary,
    DevScopeProjectGitOverviewItem,
    DevScopePullRequestDraftSource,
    DevScopePullRequestProvider,
    DevScopePullRequestSummary,
    DevScopeCreatePullRequestInput,
    DevScopeCommitPushPullRequestInput,
    DevScopeGitTextProvider
} from './devscope-git-contracts'
import type {
    DevScopeFileItem,
    DevScopeFileTreeNode,
    DevScopeFolderItem,
    DevScopeIndexedPathSearchInput,
    DevScopeIndexedPathSearchResult,
    DevScopeIndexedProject,
    DevScopeInstalledIde,
    DevScopePathInfo,
    DevScopeProcessInfo,
    DevScopeProject,
    DevScopeProjectDetails,
    DevScopePythonPreviewEvent
} from './devscope-project-contracts'
import type { ZyraMemoryApi } from './memory-contracts'

export * from './devscope-git-contracts'
export * from './devscope-project-contracts'
export * from './memory-contracts'

export type DevScopeOk<T = Record<string, unknown>> = { success: true } & T
export type DevScopeErr = { success: false; error: string }
export type DevScopeResult<T = Record<string, unknown>> = DevScopeOk<T> | DevScopeErr

export type DevScopeBrowserPreviewConfig = {
    partition: string
    webPreferences: string
    profileScope: 'global'
    persistent: true
}

export type DevScopeBrowserLinkPreview = {
    url: string
    title: string | null
    description: string | null
    imageUrl: string | null
    siteName: string | null
}

export type DevScopePreviewTerminalEvent = {
    sessionId: string
    type: 'started' | 'output' | 'exit' | 'error' | 'title' | 'clear'
    data?: string
    message?: string
    shell?: string
    cwd?: string
    title?: string
    groupKey?: string
    status?: 'running' | 'exited' | 'error'
    exitCode?: number
}

export const GIT_CLONE_PROGRESS_CHANNEL = 'devscope:gitClone:progress'

export type DevScopeGitCloneStatus = 'running' | 'success' | 'error'

export type DevScopeGitCloneInput = {
    cloneId: string
    repoUrl: string
    destinationDirectory: string
    targetName?: string
}

export type DevScopeGitCloneProgressEvent = {
    cloneId: string
    status: DevScopeGitCloneStatus
    message: string
    repoName?: string
    clonePath?: string
    phase?: string
    percent?: number
    error?: string
}

export type DevScopeGitCloneResult = {
    cloneId: string
    repoName: string
    clonePath: string
}

export type DevScopePreviewTerminalSessionSummary = {
    sessionId: string
    title: string
    shell: string
    cwd: string
    groupKey: string
    status: 'running' | 'exited' | 'error'
    startedAt: number
    lastActivityAt: number
    exitCode?: number | null
    recentOutput?: string
}

export type DevScopeReleaseChannel = 'alpha' | 'beta' | 'stable'
export type DevScopeUpdateStatus =
    | 'disabled'
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'up-to-date'
    | 'error'

export type DevScopeUpdateErrorContext = 'check' | 'download' | 'install' | null

export type DevScopeUpdateState = {
    enabled: boolean
    status: DevScopeUpdateStatus
    currentVersion: string
    currentDisplayVersion: string
    channel: DevScopeReleaseChannel
    repository: string
    releasePageUrl: string
    disabledReason: string | null
    availableVersion: string | null
    availableDisplayVersion: string | null
    downloadedVersion: string | null
    downloadedDisplayVersion: string | null
    downloadPercent: number | null
    checkedAt: string | null
    message: string | null
    errorContext: DevScopeUpdateErrorContext
    canRetry: boolean
}

export type DevScopeUpdateActionResult = {
    accepted: boolean
    completed: boolean
    state: DevScopeUpdateState
}

export interface DevScopeWindowApi {
    minimize: () => void
    maximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
}

export interface DevScopeUpdatesApi {
    getState: () => Promise<DevScopeUpdateState>
    checkForUpdates: () => Promise<DevScopeUpdateActionResult>
    downloadUpdate: () => Promise<DevScopeUpdateActionResult>
    installUpdate: () => Promise<DevScopeUpdateActionResult>
    onStateChange: (callback: (state: DevScopeUpdateState) => void) => () => void
}

export interface DevScopeTerminalApi {
    [method: string]: (...args: any[]) => any
}

export interface DevScopeAgentScopeApi {
    [method: string]: (...args: any[]) => any
}

export interface DevScopeAssistantApi {
    subscribe: () => Promise<DevScopeResult>
    unsubscribe: () => Promise<DevScopeResult>
    bootstrap: () => Promise<AssistantBootstrapPayload>
    getSnapshot: () => Promise<AssistantShellSnapshot>
    getFleetSnapshot: (threadId: string) => Promise<DevScopeResult<AssistantFleetSnapshotPayload>>
    agentAction: (input: FleetOperationInput) => Promise<DevScopeResult<AssistantFleetOperationResultPayload>>
    workflowAction: (input: FleetOperationInput) => Promise<DevScopeResult<AssistantFleetOperationResultPayload>>
    getStatus: () => Promise<AssistantRuntimeStatus>
    getAccountOverview: () => Promise<DevScopeResult<AssistantAccountOverviewPayload>>
    getSessionTurnUsage: (input?: AssistantGetSessionTurnUsageInput) => Promise<DevScopeResult<AssistantSessionTurnUsageResultPayload>>
    listModels: (forceRefresh?: boolean) => Promise<DevScopeResult<{ models: AssistantModelInfo[] }>>
    connect: (options?: AssistantConnectOptions) => Promise<DevScopeResult<{ threadId: string }>>
    disconnect: (sessionId?: string) => Promise<DevScopeResult>
    createSession: (input?: AssistantCreateSessionInput) => Promise<DevScopeResult<{ sessionId: string }>>
    selectSession: (sessionId: string) => Promise<DevScopeResult<{ sessionId: string; snapshot?: AssistantSnapshot }>>
    selectThread: (input: AssistantSelectThreadInput) => Promise<DevScopeResult<{ sessionId: string; threadId: string; snapshot?: AssistantSnapshot }>>
    getThreadDetailBootstrap: (threadId: string) => Promise<DevScopeResult<AssistantThreadDetailResultPayload>>
    getHistoryPage: (input: AssistantGetHistoryPageInput) => Promise<DevScopeResult<AssistantHistoryPageResultPayload>>
    getReviewIndex: (input: AssistantGetReviewIndexInput) => Promise<DevScopeResult<AssistantReviewIndexResultPayload>>
    getTurnDetail: (input: AssistantGetTurnDetailInput) => Promise<DevScopeResult<AssistantTurnDetailResultPayload>>
    searchTurns: (input: AssistantSearchTurnsInput) => Promise<DevScopeResult<AssistantSearchTurnsResultPayload>>
    renameSession: (sessionId: string, title: string) => Promise<DevScopeResult>
    archiveSession: (sessionId: string, archived?: boolean) => Promise<DevScopeResult>
    deleteSession: (sessionId: string) => Promise<DevScopeResult>
    deleteMessage: (input: AssistantDeleteMessageInput) => Promise<DevScopeResult>
    clearLogs: (input?: AssistantClearLogsInput) => Promise<DevScopeResult>
    setSessionProjectPath: (sessionId: string, projectPath: string | null) => Promise<DevScopeResult>
    setPlaygroundRoot: (input: AssistantSetPlaygroundRootInput) => Promise<DevScopeResult<AssistantPlaygroundResultPayload>>
    createPlaygroundLab: (input: AssistantCreatePlaygroundLabInput) => Promise<DevScopeResult<{ labId: string; sessionId?: string | null } & AssistantPlaygroundResultPayload>>
    deletePlaygroundLab: (input: AssistantDeletePlaygroundLabInput) => Promise<DevScopeResult<AssistantPlaygroundResultPayload>>
    attachSessionToPlaygroundLab: (input: AssistantAttachSessionToPlaygroundLabInput) => Promise<DevScopeResult<AssistantPlaygroundResultPayload>>
    approvePendingPlaygroundLabRequest: (input: AssistantApprovePendingPlaygroundLabRequestInput) => Promise<DevScopeResult<{ sessionId: string; labId: string } & AssistantPlaygroundResultPayload>>
    declinePendingPlaygroundLabRequest: (input: AssistantDeclinePendingPlaygroundLabRequestInput) => Promise<DevScopeResult>
    getPathForFile: (file: File) => string
    persistClipboardImage: (input: AssistantPersistClipboardImageInput) => Promise<DevScopeResult<{ path: string }>>
    resolveClipboardAttachment: (input: { reference: string }) => Promise<DevScopeResult<{ path: string | null }>>
    newThread: (sessionId?: string) => Promise<DevScopeResult<{ threadId: string }>>
    sendPrompt: (prompt: string, options?: AssistantSendPromptOptions) =>
        Promise<DevScopeResult<{ sessionId: string; threadId: string; turnId: string }>>
    interruptTurn: (turnId?: string, sessionId?: string) => Promise<DevScopeResult>
    respondApproval: (input: AssistantApprovalResponseInput) => Promise<DevScopeResult>
    respondUserInput: (input: AssistantUserInputResponseInput) => Promise<DevScopeResult>
    startRealtimeVoice: (input: AssistantStartRealtimeVoiceInput) => Promise<DevScopeResult<{ threadId: string; sdp: string }>>
    stopRealtimeVoice: () => Promise<DevScopeResult>
    onRealtimeVoiceEvent: (callback: (event: AssistantRealtimeVoiceEvent) => void) => () => void
    getTranscriptionModelState: () => Promise<DevScopeResult<{ state: AssistantTranscriptionModelState }>>
    downloadTranscriptionModel: () => Promise<DevScopeResult<{ state: AssistantTranscriptionModelState }>>
    transcribeAudioWithLocalModel: (input: AssistantTranscribeAudioInput) => Promise<DevScopeResult<{ text: string }>>
    onEvent: (callback: (event: AssistantEventStreamPayload) => void) => () => void
}

export interface DevScopeApi {
    // Settings + AI
    setStartupSettings: (settings: { openAtLogin: boolean; openAsHidden: boolean }) => Promise<DevScopeResult>
    getStartupSettings: () => Promise<DevScopeResult>
    listInstalledPackageRuntimes: () => Promise<DevScopeResult<{ runtimes: DevScopeInstalledPackageRuntime[] }>>
    getAiDebugLogs: (limit?: number) => Promise<DevScopeResult>
    clearAiDebugLogs: () => Promise<DevScopeResult>
    testGroqConnection: (apiKey: string) => Promise<DevScopeResult>
    testGeminiConnection: (apiKey: string) => Promise<DevScopeResult>
    testCodexConnection: (model?: string) => Promise<DevScopeResult>
    generateCommitMessage: (provider: DevScopeGitTextProvider, apiKey: string, diff: string, model?: string) => Promise<DevScopeResult<{ message: string }>>

    // Projects + Git
    selectFolder: () => Promise<DevScopeResult<{ folderPath?: string; cancelled?: boolean }>>
    selectMarkdownFile: () => Promise<DevScopeResult<{ filePath?: string; cancelled?: boolean }>>
    getUserHomePath: () => Promise<DevScopeResult<{ path: string }>>
    scanProjects: (folderPath: string, options?: { forceRefresh?: boolean }) => Promise<DevScopeResult<{ projects: DevScopeProject[]; folders: DevScopeFolderItem[]; files: DevScopeFileItem[]; cached?: boolean; cachedAt?: number }>>
    openInExplorer: (path: string) => Promise<DevScopeResult>
    openInTerminal: (path: string, preferredShell?: 'powershell' | 'cmd', initialCommand?: string) => Promise<DevScopeResult>
    listInstalledIdes: () => Promise<DevScopeResult<{ ides: DevScopeInstalledIde[] }>>
    openProjectInIde: (projectPath: string, ideId: string) => Promise<DevScopeResult<{ ide: DevScopeInstalledIde }>>
    installProjectDependencies: (
        projectPath: string,
        options?: { onlyMissing?: boolean }
    ) => Promise<DevScopeResult<{
        manager: 'npm' | 'pnpm' | 'yarn' | 'bun'
        durationMs: number
        message?: string
        output?: string
        installStatus?: {
            installed: boolean | null
            checked: boolean
            ecosystem: 'node' | 'unknown'
            totalPackages: number
            installedPackages: number
            missingPackages: number
            missingDependencies?: string[]
            missingSample?: string[]
            reason?: string
        } | null
    }>>
    getProjectDetails: (projectPath: string) => Promise<DevScopeResult<{ project: DevScopeProjectDetails }>>
    getFileTree: (
        projectPath: string,
        options?: {
            showHidden?: boolean
            maxDepth?: number
            rootPath?: string
            includeGitStatus?: boolean
            includeFileSize?: boolean
        }
    ) => Promise<DevScopeResult<{ tree: DevScopeFileTreeNode[] }>>
    getGitHistory: (
        projectPath: string,
        limit?: number,
        options?: { all?: boolean; includeStats?: boolean }
    ) => Promise<DevScopeResult<{ commits: DevScopeGitCommit[] }>>
    getGitHistoryCount: (
        projectPath: string,
        options?: { all?: boolean }
    ) => Promise<DevScopeResult<DevScopeGitHistoryCount>>
    getGitCommitStats: (
        projectPath: string,
        commitHashes: string[]
    ) => Promise<DevScopeResult<{ commits: DevScopeGitCommit[] }>>
    getCommitDiff: (projectPath: string, commitHash: string) => Promise<DevScopeResult<{ diff: string }>>
    getWorkingDiff: (
        projectPath: string,
        filePath?: string,
        mode?: 'combined' | 'staged' | 'unstaged'
    ) => Promise<DevScopeResult<{ diff: string }>>
    getWorkingChangesForAI: (projectPath: string) => Promise<DevScopeResult<{ context: string }>>
    getGitStatus: (projectPath: string) => Promise<DevScopeResult<{ status: Record<string, DevScopeGitFileStatus | undefined> }>>
    getGitStatusDetailed: (
        projectPath: string,
        options?: { includeStats?: boolean }
    ) => Promise<DevScopeResult<{ entries: DevScopeGitStatusDetail[] }>>
    getGitStatusEntryStats: (
        projectPath: string,
        filePaths: string[]
    ) => Promise<DevScopeResult<{ entries: DevScopeGitStatusEntryStats[] }>>
    getGitSyncStatus: (projectPath: string) => Promise<DevScopeResult<{ sync: DevScopeGitSyncStatus }>>
    getIncomingCommits: (projectPath: string, limit?: number) => Promise<DevScopeResult<{ commits: DevScopeGitCommit[] }>>
    getUnpushedCommits: (projectPath: string) => Promise<DevScopeResult<{ commits: DevScopeGitCommit[] }>>
    getGitUser: (projectPath: string) => Promise<DevScopeResult<{ user: { name: string; email: string } | null }>>
    getGlobalGitUser: () => Promise<DevScopeResult<{ user: { name: string; email: string } | null }>>
    getRepoOwner: (projectPath: string) => Promise<DevScopeResult<{ owner: string | null }>>
    getGitHubPublishContext: (
        projectPath: string
    ) => Promise<DevScopeResult<{ context: DevScopeGitHubPublishContext }>>
    getCurrentBranchPullRequest: (
        projectPath: string
    ) => Promise<DevScopeResult<{ pullRequest: DevScopePullRequestSummary | null }>>
    createOrOpenPullRequest: (
        projectPath: string,
        input: DevScopeCreatePullRequestInput
    ) => Promise<DevScopeResult<{
        status: 'created' | 'opened_existing'
        draftSource: DevScopePullRequestDraftSource
        provider?: DevScopePullRequestProvider
        pullRequest: DevScopePullRequestSummary
    }>>
    commitPushAndCreatePullRequest: (
        projectPath: string,
        input: DevScopeCommitPushPullRequestInput
    ) => Promise<DevScopeResult<{
        status: 'created' | 'opened_existing'
        draftSource: DevScopePullRequestDraftSource
        provider?: DevScopePullRequestProvider
        pullRequest: DevScopePullRequestSummary
        commitMessage: string
    }>>
    hasRemoteOrigin: (projectPath: string) => Promise<DevScopeResult<{ hasRemote: boolean }>>
    getProjectsGitOverview: (projectPaths: string[]) => Promise<DevScopeResult<{ items: DevScopeProjectGitOverviewItem[] }>>
    stageFiles: (
        projectPath: string,
        files: string[],
        options?: { scope?: 'project' | 'repo' }
    ) => Promise<DevScopeResult>
    unstageFiles: (
        projectPath: string,
        files: string[],
        options?: { scope?: 'project' | 'repo' }
    ) => Promise<DevScopeResult>
    discardChanges: (
        projectPath: string,
        files: string[],
        options?: { scope?: 'project' | 'repo'; mode?: 'unstaged' | 'staged' | 'both' }
    ) => Promise<DevScopeResult>
    createCommit: (projectPath: string, message: string) => Promise<DevScopeResult>
    setGlobalGitUser: (user: { name: string; email: string }) => Promise<DevScopeResult>
    pushCommits: (
        projectPath: string,
        options?: { remoteName?: string; branchName?: string }
    ) => Promise<DevScopeResult>
    pushSingleCommit: (
        projectPath: string,
        commitHash: string,
        options?: { remoteName?: string; branchName?: string }
    ) => Promise<DevScopeResult>
    fetchUpdates: (projectPath: string, remoteName?: string) => Promise<DevScopeResult>
    pullUpdates: (
        projectPath: string,
        options?: {
            remoteName?: string
            branchName?: string
            pushRemoteName?: string
        }
    ) => Promise<DevScopeResult>
    listBranches: (projectPath: string) => Promise<DevScopeResult<{ branches: DevScopeGitBranchSummary[] }>>
    createBranch: (projectPath: string, branchName: string, checkout?: boolean) => Promise<DevScopeResult>
    checkoutBranch: (projectPath: string, branchName: string, options?: { autoStash?: boolean; autoCleanupLock?: boolean }) => Promise<DevScopeResult<{ stashed: boolean; cleanedLock?: boolean; stashRef?: string; stashMessage?: string }>>
    deleteBranch: (projectPath: string, branchName: string, force?: boolean) => Promise<DevScopeResult>
    addRemote: (projectPath: string, remoteName: string, remoteUrl: string) => Promise<DevScopeResult>
    listRemotes: (projectPath: string) => Promise<DevScopeResult<{ remotes: DevScopeGitRemoteSummary[] }>>
    setRemoteUrl: (projectPath: string, remoteName: string, remoteUrl: string) => Promise<DevScopeResult>
    removeRemote: (projectPath: string, remoteName: string) => Promise<DevScopeResult>
    listTags: (projectPath: string) => Promise<DevScopeResult<{ tags: DevScopeGitTagSummary[] }>>
    createTag: (projectPath: string, tagName: string, target?: string) => Promise<DevScopeResult>
    deleteTag: (projectPath: string, tagName: string) => Promise<DevScopeResult>
    listStashes: (projectPath: string) => Promise<DevScopeResult<{ stashes: DevScopeGitStashSummary[] }>>
    createStash: (projectPath: string, message?: string) => Promise<DevScopeResult>
    applyStash: (projectPath: string, stashRef?: string, pop?: boolean) => Promise<DevScopeResult>
    dropStash: (projectPath: string, stashRef?: string) => Promise<DevScopeResult>
    checkIsGitRepo: (projectPath: string) => Promise<DevScopeResult<{ isGitRepo: boolean }>>
    initGitRepo: (projectPath: string, branchName: string, createGitignore: boolean, gitignoreTemplate?: string) => Promise<DevScopeResult>
    createInitialCommit: (projectPath: string, message: string) => Promise<DevScopeResult>
    addRemoteOrigin: (projectPath: string, remoteUrl: string) => Promise<DevScopeResult>
    cloneGitRepository: (input: DevScopeGitCloneInput) => Promise<DevScopeResult<DevScopeGitCloneResult>>
    onGitCloneProgress: (callback: (event: DevScopeGitCloneProgressEvent) => void) => () => void
    getGitignoreTemplates: () => Promise<DevScopeResult<{ templates: string[] }>>
    generateGitignoreContent: (template: string) => Promise<DevScopeResult<{ content: string }>>
    getGitignorePatterns: () => Promise<DevScopeResult<{ patterns: Array<{ id: string; label: string; description: string; category: string; patterns: string[] }> }>>
    generateCustomGitignoreContent: (selectedPatternIds: string[]) => Promise<DevScopeResult<{ content: string }>>
    copyToClipboard: (text: string) => Promise<DevScopeResult>
    readFileContent: (filePath: string) => Promise<DevScopeResult<{ content: string; size: number; previewBytes: number; truncated: boolean; modifiedAt: number }>>
    readTextFileFull: (filePath: string) => Promise<DevScopeResult<{ content: string; size: number; modifiedAt: number }>>
    getPathInfo: (targetPath: string) => Promise<DevScopeResult<DevScopePathInfo>>
    writeTextFile: (
        filePath: string,
        content: string,
        expectedModifiedAt?: number
    ) => Promise<DevScopeResult<{ size: number; modifiedAt: number }> | (DevScopeErr & { conflict?: boolean; currentModifiedAt?: number })>
    runPythonPreview: (input: { sessionId: string; filePath: string; projectPath?: string }) =>
        Promise<DevScopeResult<{ pid: number | null; interpreter: string; command: string }>>
    stopPythonPreview: (sessionId: string) => Promise<DevScopeResult<{ stopped: boolean }>>
    onPythonPreviewEvent: (callback: (event: DevScopePythonPreviewEvent) => void) => () => void
    createPreviewTerminal: (input: {
        sessionId: string
        targetPath?: string
        preferredShell?: 'powershell' | 'cmd'
        cols?: number
        rows?: number
        title?: string
    }) => Promise<DevScopeResult<{ shell: string; cwd: string; groupKey: string; session: DevScopePreviewTerminalSessionSummary }>>
    listPreviewTerminalSessions: (input?: { targetPath?: string }) =>
        Promise<DevScopeResult<{ groupKey?: string; cwd?: string; sessions: DevScopePreviewTerminalSessionSummary[] }>>
    writePreviewTerminal: (input: { sessionId: string; data: string }) => Promise<DevScopeResult>
    setPreviewTerminalTitle: (input: { sessionId: string; title: string }) => Promise<DevScopeResult<{ title: string }>>
    resizePreviewTerminal: (input: { sessionId: string; cols: number; rows: number }) => Promise<DevScopeResult>
    clearPreviewTerminal: (sessionId: string) => Promise<DevScopeResult>
    closePreviewTerminal: (sessionId: string) => Promise<DevScopeResult<{ closed: boolean }>>
    onPreviewTerminalEvent: (callback: (event: DevScopePreviewTerminalEvent) => void) => () => void
    getBrowserPreviewConfig: () => Promise<DevScopeResult<DevScopeBrowserPreviewConfig>>
    clearBrowserPreviewData: () => Promise<DevScopeResult<{ cleared: boolean }>>
    getBrowserLinkPreview: (input: { url: string }) => Promise<DevScopeResult<{ preview: DevScopeBrowserLinkPreview | null }>>
    openBrowserPreviewExternal: (url: string) => Promise<DevScopeResult>
    openFile: (filePath: string) => Promise<DevScopeResult>
    openWith: (filePath: string) => Promise<DevScopeResult>
    createFileSystemItem: (
        destinationDirectory: string,
        name: string,
        type: 'file' | 'directory'
    ) => Promise<DevScopeResult<{ path: string; name: string; type: 'file' | 'directory' }>>
    renameFileSystemItem: (targetPath: string, nextName: string) => Promise<DevScopeResult<{ path: string; name: string }>>
    deleteFileSystemItem: (targetPath: string) => Promise<DevScopeResult>
    pasteFileSystemItem: (sourcePath: string, destinationDirectory: string) => Promise<DevScopeResult<{ path: string; name: string }>>
    moveFileSystemItem: (sourcePath: string, destinationDirectory: string) => Promise<DevScopeResult<{ path: string; name: string }>>
    getProjectSessions: (projectPath: string) => Promise<DevScopeResult>
    getProjectProcesses: (projectPath: string) => Promise<DevScopeResult<{ isLive: boolean; processes: DevScopeProcessInfo[]; activePorts: number[] }>>
    indexAllFolders: (
        folders: string[],
        options?: { forceRefresh?: boolean }
    ) => Promise<DevScopeResult<{ projects: DevScopeIndexedProject[]; indexedCount: number; indexedFolders: number; indexedFiles: number; scannedFolderPaths: string[]; errors?: Array<{ folder: string; error: string }> }>>
    searchIndexedPaths: (
        input: DevScopeIndexedPathSearchInput
    ) => Promise<DevScopeResult<DevScopeIndexedPathSearchResult>>
    getFileSystemRoots: () => Promise<DevScopeResult<{ roots: string[] }>>

    terminal: DevScopeTerminalApi
    memory: ZyraMemoryApi
    assistant: DevScopeAssistantApi
    agentscope: DevScopeAgentScopeApi
    updates: DevScopeUpdatesApi
    window: DevScopeWindowApi
}

export type DevScopePackageRuntimeId = 'node' | 'npm' | 'pnpm' | 'yarn' | 'bun'

export interface DevScopeInstalledPackageRuntime {
    id: DevScopePackageRuntimeId
    name: string
    command: string
    installed: boolean
    version?: string
    path?: string
}
