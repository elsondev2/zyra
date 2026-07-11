import { ipcRenderer, webUtils } from 'electron'
import type {
    AssistantApprovalResponseInput,
    AssistantApprovePendingPlaygroundLabRequestInput,
    AssistantAttachSessionToPlaygroundLabInput,
    AssistantClearLogsInput,
    AssistantConnectOptions,
    AssistantCreatePlaygroundLabInput,
    AssistantCreateSessionInput,
    AssistantDeclinePendingPlaygroundLabRequestInput,
    AssistantDeletePlaygroundLabInput,
    AssistantDeleteMessageInput,
    AssistantEventStreamPayload,
    AssistantPersistClipboardImageInput,
    AssistantResolveClipboardAttachmentInput,
    AssistantSendPromptOptions,
    AssistantSelectThreadInput,
    AssistantSetPlaygroundRootInput,
    AssistantTranscribeAudioInput,
    AssistantUserInputResponseInput
} from '../../shared/assistant/contracts'
import { ASSISTANT_IPC, assertAssistantIpcContract } from '../../shared/assistant/contracts'

export function createAssistantAdapter() {
    assertAssistantIpcContract()

    return {
        assistant: {
            subscribe: () => ipcRenderer.invoke(ASSISTANT_IPC.subscribe),
            unsubscribe: () => ipcRenderer.invoke(ASSISTANT_IPC.unsubscribe),
            bootstrap: () => ipcRenderer.invoke(ASSISTANT_IPC.bootstrap),
            getSnapshot: () => ipcRenderer.invoke(ASSISTANT_IPC.getSnapshot),
            getStatus: () => ipcRenderer.invoke(ASSISTANT_IPC.getStatus),
            getAccountOverview: () => ipcRenderer.invoke(ASSISTANT_IPC.getAccountOverview),
            getSessionTurnUsage: (input?: { sessionId?: string }) => ipcRenderer.invoke(ASSISTANT_IPC.getSessionTurnUsage, input),
            listModels: (forceRefresh = false) => ipcRenderer.invoke(ASSISTANT_IPC.listModels, forceRefresh),
            connect: (options?: AssistantConnectOptions) => ipcRenderer.invoke(ASSISTANT_IPC.connect, options),
            disconnect: (sessionId?: string) => ipcRenderer.invoke(ASSISTANT_IPC.disconnect, sessionId),
            createSession: (input?: AssistantCreateSessionInput) => ipcRenderer.invoke(ASSISTANT_IPC.createSession, input),
            selectSession: (sessionId: string) => ipcRenderer.invoke(ASSISTANT_IPC.selectSession, sessionId),
            selectThread: (input: AssistantSelectThreadInput) => ipcRenderer.invoke(ASSISTANT_IPC.selectThread, input),
            hydrateSession: (sessionId: string) => ipcRenderer.invoke(ASSISTANT_IPC.hydrateSession, sessionId),
            renameSession: (sessionId: string, title: string) => ipcRenderer.invoke(ASSISTANT_IPC.renameSession, sessionId, title),
            archiveSession: (sessionId: string, archived = true) => ipcRenderer.invoke(ASSISTANT_IPC.archiveSession, sessionId, archived),
            deleteSession: (sessionId: string) => ipcRenderer.invoke(ASSISTANT_IPC.deleteSession, sessionId),
            deleteMessage: (input: AssistantDeleteMessageInput) => ipcRenderer.invoke(ASSISTANT_IPC.deleteMessage, input),
            clearLogs: (input?: AssistantClearLogsInput) => ipcRenderer.invoke(ASSISTANT_IPC.clearLogs, input),
            setSessionProjectPath: (sessionId: string, projectPath: string | null) =>
                ipcRenderer.invoke(ASSISTANT_IPC.setSessionProjectPath, sessionId, projectPath),
            setPlaygroundRoot: (input: AssistantSetPlaygroundRootInput) =>
                ipcRenderer.invoke(ASSISTANT_IPC.setPlaygroundRoot, input),
            createPlaygroundLab: (input: AssistantCreatePlaygroundLabInput) =>
                ipcRenderer.invoke(ASSISTANT_IPC.createPlaygroundLab, input),
            deletePlaygroundLab: (input: AssistantDeletePlaygroundLabInput) =>
                ipcRenderer.invoke(ASSISTANT_IPC.deletePlaygroundLab, input),
            attachSessionToPlaygroundLab: (input: AssistantAttachSessionToPlaygroundLabInput) =>
                ipcRenderer.invoke(ASSISTANT_IPC.attachSessionToPlaygroundLab, input),
            approvePendingPlaygroundLabRequest: (input: AssistantApprovePendingPlaygroundLabRequestInput) =>
                ipcRenderer.invoke(ASSISTANT_IPC.approvePendingPlaygroundLabRequest, input),
            declinePendingPlaygroundLabRequest: (input: AssistantDeclinePendingPlaygroundLabRequestInput) =>
                ipcRenderer.invoke(ASSISTANT_IPC.declinePendingPlaygroundLabRequest, input),
            getPathForFile: (file: File) => webUtils.getPathForFile(file),
            persistClipboardImage: (input: AssistantPersistClipboardImageInput) =>
                ipcRenderer.invoke(ASSISTANT_IPC.persistClipboardImage, input),
            resolveClipboardAttachment: (input: AssistantResolveClipboardAttachmentInput) =>
                ipcRenderer.invoke(ASSISTANT_IPC.resolveClipboardAttachment, input),
            newThread: (sessionId?: string) => ipcRenderer.invoke(ASSISTANT_IPC.newThread, sessionId),
            sendPrompt: (prompt: string, options?: AssistantSendPromptOptions) => ipcRenderer.invoke(ASSISTANT_IPC.sendPrompt, prompt, options),
            interruptTurn: (turnId?: string, sessionId?: string) => ipcRenderer.invoke(ASSISTANT_IPC.interruptTurn, turnId, sessionId),
            respondApproval: (input: AssistantApprovalResponseInput) =>
                ipcRenderer.invoke(ASSISTANT_IPC.respondApproval, input),
            respondUserInput: (input: AssistantUserInputResponseInput) =>
                ipcRenderer.invoke(ASSISTANT_IPC.respondUserInput, input),
            getTranscriptionModelState: () => ipcRenderer.invoke(ASSISTANT_IPC.getTranscriptionModelState),
            downloadTranscriptionModel: () => ipcRenderer.invoke(ASSISTANT_IPC.downloadTranscriptionModel),
            transcribeAudioWithLocalModel: (input: AssistantTranscribeAudioInput) => ipcRenderer.invoke(ASSISTANT_IPC.transcribeAudioWithLocalModel, input),
            onEvent: (callback: (payload: AssistantEventStreamPayload) => void) => {
                const listener = (_event: Electron.IpcRendererEvent, payload: AssistantEventStreamPayload) => {
                    callback(payload)
                }
                ipcRenderer.on(ASSISTANT_IPC.eventStream, listener)
                void ipcRenderer.invoke(ASSISTANT_IPC.subscribe).catch(() => undefined)
                return () => {
                    ipcRenderer.removeListener(ASSISTANT_IPC.eventStream, listener)
                    void ipcRenderer.invoke(ASSISTANT_IPC.unsubscribe).catch(() => undefined)
                }
            }
        }
    }
}
