/**
 * Zyra - IPC Handler Registry
 */

import { BrowserWindow, ipcMain } from 'electron'
import log from 'electron-log'
import {
    handleGetFileSystemRoots,
} from './handlers/system-handlers'
import {
    handleClearAiDebugLogs,
    handleGenerateCommitMessage,
    handleGetAiDebugLogs,
    handleGetStartupSettings,
    handleListInstalledPackageRuntimes,
    handleSetStartupSettings,
    handleTestCodexConnection,
    handleTestGeminiConnection,
    handleTestGroqConnection
} from './handlers/settings-ai-handlers'
import { handleMemoryGetOverview } from './handlers/memory-handlers'
import {
    handleAssistantApprovePendingPlaygroundLabRequest,
    handleAssistantArchiveSession,
    handleAssistantAttachSessionToPlaygroundLab,
    handleAssistantAgentAction,
    handleAssistantBootstrap,
    handleAssistantClearLogs,
    handleAssistantConnect,
    handleAssistantCreatePlaygroundLab,
    handleAssistantCreateSession,
    handleAssistantDeletePlaygroundLab,
    handleAssistantDeleteMessage,
    handleAssistantDeleteSession,
    handleAssistantDeclinePendingPlaygroundLabRequest,
    handleAssistantDisconnect,
    handleAssistantGetAccountOverview,
    handleAssistantGetFleetSnapshot,
    handleAssistantGetHistoryPage,
    handleAssistantGetReviewIndex,
    handleAssistantGetSessionTurnUsage,
    handleAssistantGetThreadDetailBootstrap,
    handleAssistantGetVoiceTranscriptionState,
    handleAssistantGetTurnDetail,
    handleAssistantGetSnapshot,
    handleAssistantGetStatus,
    handleAssistantInterruptTurn,
    handleAssistantListModels,
    handleAssistantNewThread,
    handleAssistantPersistClipboardImage,
    handleAssistantRedeemAccountReset,
    handleAssistantResolveClipboardAttachment,
    handleAssistantRenameSession,
    handleAssistantRespondApproval,
    handleAssistantRespondUserInput,
    handleAssistantSendRealtimeVoiceMessage,
    handleAssistantStartRealtimeVoice,
    handleAssistantStopRealtimeVoice,
    handleAssistantSubscribeRealtimeVoice,
    handleAssistantTranscribeVoice,
    handleAssistantUnsubscribeRealtimeVoice,
    handleAssistantWorkflowAction,
    handleAssistantSearchTurns,
    handleAssistantSelectSession,
    handleAssistantSelectThread,
    handleAssistantSendPrompt,
    handleAssistantSetPlaygroundRoot,
    handleAssistantSetSessionProjectPath,
    handleAssistantSubscribe,
    handleAssistantUnsubscribe
} from './handlers/assistant-handlers'
import { ASSISTANT_IPC } from '../../shared/assistant/contracts'
import { peekAssistantService } from '../assistant'
import {
    handleCopyToClipboard,
    handleGetUserHomePath,
    handleIndexAllFolders,
    handleOpenFile,
    handleOpenInExplorer,
    handleOpenProjectInIde,
    handleOpenWith,
    handleListInstalledIdes,
    handleScanProjects,
    handleSearchIndexedPaths,
    handleSelectFolder,
    handleSelectMarkdownFile,
    handleSelectProjectIconFile
} from './handlers/project-discovery-handlers'
import {
    handleGetProjectDetails,
    handleInstallProjectDependencies,
    handleGetProjectProcesses,
    handleGetProjectSessions
} from './handlers/project-details-handlers'
import {
    handleCreateFileSystemItem,
    handleDeleteFileSystemItem,
    handleGetFileTree,
    handleGetPathInfo,
    handlePasteFileSystemItem,
    handleMoveFileSystemItem,
    handleReadFileContent,
    handleReadTextFileFull,
    handleRenameFileSystemItem,
    handleWriteTextFile
} from './handlers/file-tree-handlers'
import { handleOpenInTerminal } from './handlers/terminal-handlers'
import {
    handleClearPreviewTerminal,
    handleClosePreviewTerminal,
    handleCreatePreviewTerminal,
    handleListPreviewTerminalSessions,
    handleResizePreviewTerminal,
    handleSetPreviewTerminalTitle,
    handleWritePreviewTerminal
} from './handlers/preview-terminal-handlers'
import { handleRunPythonPreview, handleStopPythonPreview } from './handlers/python-preview-handlers'
import {
    handleClearBrowserPreviewData,
    handleGetBrowserLinkPreview,
    handleGetBrowserPreviewConfig,
    handleOpenBrowserPreviewExternal
} from './handlers/browser-preview-handlers'
import {
    handleCancelBrowserPreviewAnnotation,
    handleCaptureBrowserPreviewScreenshot,
    handleClearBrowserPreviewCache,
    handleClearBrowserPreviewCookies,
    handleCopyBrowserPreviewArtifact,
    handleHardReloadBrowserPreview,
    handleOpenBrowserPreviewArtifact,
    handleOpenBrowserPreviewDevTools,
    handleRevealBrowserPreviewArtifact,
    handleSaveBrowserPreviewRecording,
    handleSetBrowserPreviewColorScheme,
    handleSetBrowserPreviewZoom,
    handleStageBrowserPreviewArtifactForAssistant,
    handleStartBrowserPreviewAnnotation,
    handleStartBrowserPreviewRecording,
    handleStopBrowserPreviewRecording
} from './handlers/browser-preview-developer-handlers'
import {
    handleCheckForUpdates,
    handleDownloadUpdate,
    handleGetUpdateState,
    handleInstallUpdate
} from './handlers/update-handlers'
import {
    handleDownloadGoogleFont,
    handleImportFontFile,
    handleListManagedFonts,
    handleListSystemFonts,
    handleReadManagedFont,
    handleRemoveManagedFont
} from './handlers/font-handlers'
import {
    handleCheckIsGitRepo,
    handleGenerateCustomGitignoreContent,
    handleGenerateGitignoreContent,
    handleGetCommitDiff,
    handleGetGitCommitStats,
    handleGetGitHistory,
    handleGetGitHistoryCount,
    handleGetGitStatusEntryStats,
    handleGetGitSyncStatus,
    handleGetGitStatus,
    handleGetGitStatusDetailed,
    handleGetGitHubPublishContext,
    handleGetCurrentBranchPullRequest,
    handleGetGlobalGitUser,
    handleGetGitUser,
    handleGetGitignorePatterns,
    handleGetGitignoreTemplates,
    handleGetIncomingCommits,
    handleGetProjectsGitOverview,
    handleGetRepoOwner,
    handleGetUnpushedCommits,
    handleGetWorkingChangesForAI,
    handleGetWorkingDiff,
    handleHasRemoteOrigin
} from './handlers/git-read-handlers'
import {
    handleAddRemote,
    handleAddRemoteOrigin,
    handleApplyStash,
    handleCheckoutBranch,
    handleCloneGitRepository,
    handleCreateBranch,
    handleCreateCommit,
    handleCreateOrOpenPullRequest,
    handleCommitPushAndCreatePullRequest,
    handleCreateInitialCommit,
    handleCreateStash,
    handleCreateTag,
    handleDeleteBranch,
    handleDeleteTag,
    handleDiscardChanges,
    handleDropStash,
    handleFetchUpdates,
    handleInitGitRepo,
    handleListBranches,
    handleListRemotes,
    handleListStashes,
    handleListTags,
    handlePullUpdates,
    handlePushCommits,
    handlePushSingleCommit,
    handleRemoveRemote,
    handleSetRemoteUrl,
    handleSetGlobalGitUser,
    handleStageFiles,
    handleUnstageFiles
} from './handlers/git-write-handlers'
import { createAgentControlHandlers } from './handlers/agent-control-handlers'
import { AGENT_CONTROL_IPC } from '../../shared/agent-control/protocol'
import {
    UPDATE_CHECK_CHANNEL,
    UPDATE_DOWNLOAD_CHANNEL,
    UPDATE_GET_STATE_CHANNEL,
    UPDATE_INSTALL_CHANNEL
} from '../update/manager'

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
    log.info('Registering IPC handlers...')

    const controlHandlers = createAgentControlHandlers(mainWindow)
    ipcMain.handle(AGENT_CONTROL_IPC.getState, controlHandlers.getState)
    ipcMain.handle(AGENT_CONTROL_IPC.bindBrowserTab, controlHandlers.bindBrowserTab)
    ipcMain.handle(AGENT_CONTROL_IPC.acknowledgeBrowserSurfaceRequest, controlHandlers.acknowledgeBrowserSurfaceRequest)
    ipcMain.handle(AGENT_CONTROL_IPC.completeBrowserSurfaceRequest, controlHandlers.completeBrowserSurfaceRequest)
    ipcMain.handle(AGENT_CONTROL_IPC.claimBrowserSurfaceRequest, controlHandlers.claimBrowserSurfaceRequest)
    ipcMain.handle(AGENT_CONTROL_IPC.updateWorkspaceState, controlHandlers.updateWorkspaceState)
    ipcMain.handle(AGENT_CONTROL_IPC.approveGrant, controlHandlers.approveGrant)
    ipcMain.handle(AGENT_CONTROL_IPC.rejectGrant, controlHandlers.rejectGrant)
    ipcMain.handle(AGENT_CONTROL_IPC.revokeGrant, controlHandlers.revokeGrant)
    ipcMain.handle(AGENT_CONTROL_IPC.emergencyStop, controlHandlers.emergencyStop)
    ipcMain.handle(AGENT_CONTROL_IPC.clearAudit, controlHandlers.clearAudit)
    ipcMain.handle(AGENT_CONTROL_IPC.startChromePairing, controlHandlers.startChromePairing)
    ipcMain.handle(AGENT_CONTROL_IPC.stopChromePairing, controlHandlers.stopChromePairing)
    ipcMain.handle(AGENT_CONTROL_IPC.listWindows, controlHandlers.listWindows)
    ipcMain.handle(AGENT_CONTROL_IPC.selectWindow, controlHandlers.selectWindow)

    ipcMain.handle('devscope:getFileSystemRoots', handleGetFileSystemRoots)
    ipcMain.handle(UPDATE_GET_STATE_CHANNEL, handleGetUpdateState)
    ipcMain.handle(UPDATE_CHECK_CHANNEL, handleCheckForUpdates)
    ipcMain.handle(UPDATE_DOWNLOAD_CHANNEL, handleDownloadUpdate)
    ipcMain.handle(UPDATE_INSTALL_CHANNEL, handleInstallUpdate)

    ipcMain.handle('devscope:setStartupSettings', handleSetStartupSettings)
    ipcMain.handle('devscope:getStartupSettings', handleGetStartupSettings)
    ipcMain.handle('devscope:listInstalledPackageRuntimes', handleListInstalledPackageRuntimes)
    ipcMain.handle('devscope:fonts:listManaged', handleListManagedFonts)
    ipcMain.handle('devscope:fonts:listSystem', handleListSystemFonts)
    ipcMain.handle('devscope:fonts:downloadGoogle', handleDownloadGoogleFont)
    ipcMain.handle('devscope:fonts:importFile', handleImportFontFile)
    ipcMain.handle('devscope:fonts:removeManaged', handleRemoveManagedFont)
    ipcMain.handle('devscope:fonts:readManaged', handleReadManagedFont)
    ipcMain.handle('devscope:testGroqConnection', handleTestGroqConnection)
    ipcMain.handle('devscope:testGeminiConnection', handleTestGeminiConnection)
    ipcMain.handle('devscope:testCodexConnection', handleTestCodexConnection)
    ipcMain.handle('devscope:generateCommitMessage', handleGenerateCommitMessage)
    ipcMain.handle('devscope:getAiDebugLogs', handleGetAiDebugLogs)
    ipcMain.handle('devscope:clearAiDebugLogs', handleClearAiDebugLogs)
    ipcMain.handle('zyra:memory:getOverview', handleMemoryGetOverview)
    ipcMain.handle(ASSISTANT_IPC.subscribe, handleAssistantSubscribe)
    ipcMain.handle(ASSISTANT_IPC.unsubscribe, handleAssistantUnsubscribe)
    ipcMain.handle(ASSISTANT_IPC.bootstrap, handleAssistantBootstrap)
    ipcMain.handle(ASSISTANT_IPC.getSnapshot, handleAssistantGetSnapshot)
    ipcMain.handle(ASSISTANT_IPC.getFleetSnapshot, handleAssistantGetFleetSnapshot)
    ipcMain.handle(ASSISTANT_IPC.agentAction, handleAssistantAgentAction)
    ipcMain.handle(ASSISTANT_IPC.workflowAction, handleAssistantWorkflowAction)
    ipcMain.handle(ASSISTANT_IPC.getStatus, handleAssistantGetStatus)
    ipcMain.handle(ASSISTANT_IPC.getAccountOverview, handleAssistantGetAccountOverview)
    ipcMain.handle(ASSISTANT_IPC.redeemAccountReset, handleAssistantRedeemAccountReset)
    ipcMain.handle(ASSISTANT_IPC.getSessionTurnUsage, handleAssistantGetSessionTurnUsage)
    ipcMain.handle(ASSISTANT_IPC.listModels, handleAssistantListModels)
    ipcMain.handle(ASSISTANT_IPC.connect, handleAssistantConnect)
    ipcMain.handle(ASSISTANT_IPC.disconnect, handleAssistantDisconnect)
    ipcMain.handle(ASSISTANT_IPC.createSession, handleAssistantCreateSession)
    ipcMain.handle(ASSISTANT_IPC.selectSession, handleAssistantSelectSession)
    ipcMain.handle(ASSISTANT_IPC.selectThread, handleAssistantSelectThread)
    ipcMain.handle(ASSISTANT_IPC.getThreadDetailBootstrap, handleAssistantGetThreadDetailBootstrap)
    ipcMain.handle(ASSISTANT_IPC.getHistoryPage, handleAssistantGetHistoryPage)
    ipcMain.handle(ASSISTANT_IPC.getReviewIndex, handleAssistantGetReviewIndex)
    ipcMain.handle(ASSISTANT_IPC.getTurnDetail, handleAssistantGetTurnDetail)
    ipcMain.handle(ASSISTANT_IPC.searchTurns, handleAssistantSearchTurns)
    ipcMain.handle(ASSISTANT_IPC.renameSession, handleAssistantRenameSession)
    ipcMain.handle(ASSISTANT_IPC.archiveSession, handleAssistantArchiveSession)
    ipcMain.handle(ASSISTANT_IPC.deleteSession, handleAssistantDeleteSession)
    ipcMain.handle(ASSISTANT_IPC.deleteMessage, handleAssistantDeleteMessage)
    ipcMain.handle(ASSISTANT_IPC.clearLogs, handleAssistantClearLogs)
    ipcMain.handle(ASSISTANT_IPC.setSessionProjectPath, handleAssistantSetSessionProjectPath)
    ipcMain.handle(ASSISTANT_IPC.setPlaygroundRoot, handleAssistantSetPlaygroundRoot)
    ipcMain.handle(ASSISTANT_IPC.createPlaygroundLab, handleAssistantCreatePlaygroundLab)
    ipcMain.handle(ASSISTANT_IPC.deletePlaygroundLab, handleAssistantDeletePlaygroundLab)
    ipcMain.handle(ASSISTANT_IPC.attachSessionToPlaygroundLab, handleAssistantAttachSessionToPlaygroundLab)
    ipcMain.handle(ASSISTANT_IPC.approvePendingPlaygroundLabRequest, handleAssistantApprovePendingPlaygroundLabRequest)
    ipcMain.handle(ASSISTANT_IPC.declinePendingPlaygroundLabRequest, handleAssistantDeclinePendingPlaygroundLabRequest)
    ipcMain.handle(ASSISTANT_IPC.persistClipboardImage, handleAssistantPersistClipboardImage)
    ipcMain.handle(ASSISTANT_IPC.resolveClipboardAttachment, handleAssistantResolveClipboardAttachment)
    ipcMain.handle(ASSISTANT_IPC.newThread, handleAssistantNewThread)
    ipcMain.handle(ASSISTANT_IPC.sendPrompt, handleAssistantSendPrompt)
    ipcMain.handle(ASSISTANT_IPC.interruptTurn, handleAssistantInterruptTurn)
    ipcMain.handle(ASSISTANT_IPC.respondApproval, handleAssistantRespondApproval)
    ipcMain.handle(ASSISTANT_IPC.respondUserInput, handleAssistantRespondUserInput)
    ipcMain.handle(ASSISTANT_IPC.subscribeRealtimeVoice, handleAssistantSubscribeRealtimeVoice)
    ipcMain.handle(ASSISTANT_IPC.unsubscribeRealtimeVoice, handleAssistantUnsubscribeRealtimeVoice)
    ipcMain.handle(ASSISTANT_IPC.startRealtimeVoice, handleAssistantStartRealtimeVoice)
    ipcMain.handle(ASSISTANT_IPC.sendRealtimeVoiceMessage, handleAssistantSendRealtimeVoiceMessage)
    ipcMain.handle(ASSISTANT_IPC.stopRealtimeVoice, handleAssistantStopRealtimeVoice)
    ipcMain.handle(ASSISTANT_IPC.getVoiceTranscriptionState, handleAssistantGetVoiceTranscriptionState)
    ipcMain.handle(ASSISTANT_IPC.transcribeVoice, handleAssistantTranscribeVoice)

    ipcMain.handle('devscope:selectFolder', handleSelectFolder)
    ipcMain.handle('devscope:selectMarkdownFile', handleSelectMarkdownFile)
    ipcMain.handle('devscope:selectProjectIconFile', handleSelectProjectIconFile)
    ipcMain.handle('devscope:getUserHomePath', handleGetUserHomePath)
    ipcMain.handle('devscope:scanProjects', handleScanProjects)
    ipcMain.handle('devscope:indexAllFolders', handleIndexAllFolders)
    ipcMain.handle('devscope:searchIndexedPaths', handleSearchIndexedPaths)
    ipcMain.handle('devscope:openInExplorer', handleOpenInExplorer)
    ipcMain.handle('devscope:openInTerminal', handleOpenInTerminal)
    ipcMain.handle('devscope:listInstalledIdes', handleListInstalledIdes)
    ipcMain.handle('devscope:openProjectInIde', handleOpenProjectInIde)
    ipcMain.handle('devscope:previewTerminal:create', handleCreatePreviewTerminal)
    ipcMain.handle('devscope:previewTerminal:list', handleListPreviewTerminalSessions)
    ipcMain.handle('devscope:previewTerminal:write', handleWritePreviewTerminal)
    ipcMain.handle('devscope:previewTerminal:setTitle', handleSetPreviewTerminalTitle)
    ipcMain.handle('devscope:previewTerminal:resize', handleResizePreviewTerminal)
    ipcMain.handle('devscope:previewTerminal:clear', handleClearPreviewTerminal)
    ipcMain.handle('devscope:previewTerminal:close', handleClosePreviewTerminal)
    ipcMain.handle('devscope:browserPreview:getConfig', handleGetBrowserPreviewConfig)
    ipcMain.handle('devscope:browserPreview:clearData', handleClearBrowserPreviewData)
    ipcMain.handle('devscope:browserPreview:clearCache', handleClearBrowserPreviewCache)
    ipcMain.handle('devscope:browserPreview:clearCookies', handleClearBrowserPreviewCookies)
    ipcMain.handle('devscope:browserPreview:hardReload', handleHardReloadBrowserPreview)
    ipcMain.handle('devscope:browserPreview:setZoom', handleSetBrowserPreviewZoom)
    ipcMain.handle('devscope:browserPreview:setColorScheme', handleSetBrowserPreviewColorScheme)
    ipcMain.handle('devscope:browserPreview:openDevTools', handleOpenBrowserPreviewDevTools)
    ipcMain.handle('devscope:browserPreview:captureScreenshot', handleCaptureBrowserPreviewScreenshot)
    ipcMain.handle('devscope:browserPreview:stageArtifactForAssistant', handleStageBrowserPreviewArtifactForAssistant)
    ipcMain.handle('devscope:browserPreview:openArtifact', handleOpenBrowserPreviewArtifact)
    ipcMain.handle('devscope:browserPreview:revealArtifact', handleRevealBrowserPreviewArtifact)
    ipcMain.handle('devscope:browserPreview:copyArtifact', handleCopyBrowserPreviewArtifact)
    ipcMain.handle('devscope:browserPreview:startAnnotation', handleStartBrowserPreviewAnnotation)
    ipcMain.handle('devscope:browserPreview:cancelAnnotation', handleCancelBrowserPreviewAnnotation)
    ipcMain.handle('devscope:browserPreview:startRecording', handleStartBrowserPreviewRecording)
    ipcMain.handle('devscope:browserPreview:stopRecording', handleStopBrowserPreviewRecording)
    ipcMain.handle('devscope:browserPreview:saveRecording', handleSaveBrowserPreviewRecording)
    ipcMain.handle('devscope:browserPreview:getLinkPreview', handleGetBrowserLinkPreview)
    ipcMain.handle('devscope:browserPreview:openExternal', handleOpenBrowserPreviewExternal)
    ipcMain.handle('devscope:pythonPreview:run', handleRunPythonPreview)
    ipcMain.handle('devscope:pythonPreview:stop', handleStopPythonPreview)
    ipcMain.handle('devscope:copyToClipboard', handleCopyToClipboard)
    ipcMain.handle('devscope:getProjectDetails', handleGetProjectDetails)
    ipcMain.handle('devscope:installProjectDependencies', handleInstallProjectDependencies)
    ipcMain.handle('devscope:getFileTree', handleGetFileTree)
    ipcMain.handle('devscope:readFileContent', handleReadFileContent)
    ipcMain.handle('devscope:readTextFileFull', handleReadTextFileFull)
    ipcMain.handle('devscope:getPathInfo', handleGetPathInfo)
    ipcMain.handle('devscope:writeTextFile', handleWriteTextFile)
    ipcMain.handle('devscope:openFile', handleOpenFile)
    ipcMain.handle('devscope:openWith', handleOpenWith)
    ipcMain.handle('devscope:createFileSystemItem', handleCreateFileSystemItem)
    ipcMain.handle('devscope:renameFileSystemItem', handleRenameFileSystemItem)
    ipcMain.handle('devscope:deleteFileSystemItem', handleDeleteFileSystemItem)
    ipcMain.handle('devscope:pasteFileSystemItem', handlePasteFileSystemItem)
    ipcMain.handle('devscope:moveFileSystemItem', handleMoveFileSystemItem)
    ipcMain.handle('devscope:getProjectSessions', handleGetProjectSessions)
    ipcMain.handle('devscope:getProjectProcesses', handleGetProjectProcesses)

    ipcMain.handle('devscope:getGitHistory', handleGetGitHistory)
    ipcMain.handle('devscope:getGitHistoryCount', handleGetGitHistoryCount)
    ipcMain.handle('devscope:getGitCommitStats', handleGetGitCommitStats)
    ipcMain.handle('devscope:getCommitDiff', handleGetCommitDiff)
    ipcMain.handle('devscope:getWorkingDiff', handleGetWorkingDiff)
    ipcMain.handle('devscope:getWorkingChangesForAI', handleGetWorkingChangesForAI)
    ipcMain.handle('devscope:getGitStatus', handleGetGitStatus)
    ipcMain.handle('devscope:getGitStatusDetailed', handleGetGitStatusDetailed)
    ipcMain.handle('devscope:getGitStatusEntryStats', handleGetGitStatusEntryStats)
    ipcMain.handle('devscope:getGitSyncStatus', handleGetGitSyncStatus)
    ipcMain.handle('devscope:getIncomingCommits', handleGetIncomingCommits)
    ipcMain.handle('devscope:getUnpushedCommits', handleGetUnpushedCommits)
    ipcMain.handle('devscope:getGitUser', handleGetGitUser)
    ipcMain.handle('devscope:getGlobalGitUser', handleGetGlobalGitUser)
    ipcMain.handle('devscope:getRepoOwner', handleGetRepoOwner)
    ipcMain.handle('devscope:getGitHubPublishContext', handleGetGitHubPublishContext)
    ipcMain.handle('devscope:getCurrentBranchPullRequest', handleGetCurrentBranchPullRequest)
    ipcMain.handle('devscope:hasRemoteOrigin', handleHasRemoteOrigin)
    ipcMain.handle('devscope:getProjectsGitOverview', handleGetProjectsGitOverview)
    ipcMain.handle('devscope:checkIsGitRepo', handleCheckIsGitRepo)

    ipcMain.handle('devscope:stageFiles', handleStageFiles)
    ipcMain.handle('devscope:unstageFiles', handleUnstageFiles)
    ipcMain.handle('devscope:discardChanges', handleDiscardChanges)
    ipcMain.handle('devscope:createCommit', handleCreateCommit)
    ipcMain.handle('devscope:createOrOpenPullRequest', handleCreateOrOpenPullRequest)
    ipcMain.handle('devscope:commitPushAndCreatePullRequest', handleCommitPushAndCreatePullRequest)
    ipcMain.handle('devscope:setGlobalGitUser', handleSetGlobalGitUser)
    ipcMain.handle('devscope:pushCommits', handlePushCommits)
    ipcMain.handle('devscope:pushSingleCommit', handlePushSingleCommit)
    ipcMain.handle('devscope:fetchUpdates', handleFetchUpdates)
    ipcMain.handle('devscope:pullUpdates', handlePullUpdates)
    ipcMain.handle('devscope:listBranches', handleListBranches)
    ipcMain.handle('devscope:createBranch', handleCreateBranch)
    ipcMain.handle('devscope:checkoutBranch', handleCheckoutBranch)
    ipcMain.handle('devscope:deleteBranch', handleDeleteBranch)
    ipcMain.handle('devscope:addRemote', handleAddRemote)
    ipcMain.handle('devscope:listRemotes', handleListRemotes)
    ipcMain.handle('devscope:setRemoteUrl', handleSetRemoteUrl)
    ipcMain.handle('devscope:removeRemote', handleRemoveRemote)
    ipcMain.handle('devscope:listTags', handleListTags)
    ipcMain.handle('devscope:createTag', handleCreateTag)
    ipcMain.handle('devscope:deleteTag', handleDeleteTag)
    ipcMain.handle('devscope:listStashes', handleListStashes)
    ipcMain.handle('devscope:createStash', handleCreateStash)
    ipcMain.handle('devscope:applyStash', handleApplyStash)
    ipcMain.handle('devscope:dropStash', handleDropStash)
    ipcMain.handle('devscope:initGitRepo', handleInitGitRepo)
    ipcMain.handle('devscope:createInitialCommit', handleCreateInitialCommit)
    ipcMain.handle('devscope:addRemoteOrigin', handleAddRemoteOrigin)
    ipcMain.handle('devscope:cloneGitRepository', handleCloneGitRepository)
    ipcMain.handle('devscope:getGitignoreTemplates', handleGetGitignoreTemplates)
    ipcMain.handle('devscope:generateGitignoreContent', handleGenerateGitignoreContent)
    ipcMain.handle('devscope:getGitignorePatterns', handleGetGitignorePatterns)
    ipcMain.handle('devscope:generateCustomGitignoreContent', handleGenerateCustomGitignoreContent)

    ipcMain.removeAllListeners('window:minimize')
    ipcMain.removeAllListeners('window:maximize')
    ipcMain.removeAllListeners('window:close')
    ipcMain.removeHandler('window:isMaximized')

    ipcMain.on('window:minimize', (event) => {
        const targetWindow = BrowserWindow.fromWebContents(event.sender)
        if (!targetWindow || targetWindow.isDestroyed()) return
        targetWindow.minimize()
    })
    ipcMain.on('window:maximize', (event) => {
        const targetWindow = BrowserWindow.fromWebContents(event.sender)
        if (!targetWindow || targetWindow.isDestroyed()) return
        if (targetWindow.isMaximized()) targetWindow.unmaximize()
        else targetWindow.maximize()
    })
    ipcMain.on('window:close', (event) => {
        const targetWindow = BrowserWindow.fromWebContents(event.sender)
        if (!targetWindow || targetWindow.isDestroyed()) return
        targetWindow.close()
    })
    ipcMain.handle('window:isMaximized', (event) => {
        const targetWindow = BrowserWindow.fromWebContents(event.sender)
        if (!targetWindow || targetWindow.isDestroyed()) return false
        return targetWindow.isMaximized()
    })

    mainWindow.webContents.once('destroyed', () => {
        const service = peekAssistantService()
        service?.unsubscribe(mainWindow.webContents.id)
        service?.unsubscribeRealtimeVoice(mainWindow.webContents.id)
    })
}
