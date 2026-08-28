import { ipcRenderer } from 'electron'
import {
    ASSISTANT_UTILITY_IPC,
    type AssistantUtilityAddTabInput,
    type AssistantUtilityApi,
    type AssistantUtilityDropZoneInput,
    type AssistantUtilityMainTabInput,
    type AssistantUtilityMoveInput,
    type AssistantUtilityTearOffBeginInput,
    type AssistantUtilityTearOffFinishInput,
    type AssistantUtilityTab,
    type AssistantUtilityWindowState
} from '../../shared/assistant/utility-window'

export function createAssistantUtilityAdapter(): { assistantUtility: AssistantUtilityApi } {
    return {
        assistantUtility: {
            getState: (windowId) => ipcRenderer.invoke(ASSISTANT_UTILITY_IPC.getState, windowId),
            selectTab: (windowId, tabId) => ipcRenderer.invoke(ASSISTANT_UTILITY_IPC.selectTab, windowId, tabId),
            closeTab: (windowId, tabId) => ipcRenderer.invoke(ASSISTANT_UTILITY_IPC.closeTab, windowId, tabId),
            reorderTab: (windowId, fromTabId, toTabId) => ipcRenderer.invoke(ASSISTANT_UTILITY_IPC.reorderTab, windowId, fromTabId, toTabId),
            moveTab: (input: AssistantUtilityMoveInput) => ipcRenderer.invoke(ASSISTANT_UTILITY_IPC.moveTab, input),
            registerDropZone: (input: AssistantUtilityDropZoneInput | null) => ipcRenderer.invoke(ASSISTANT_UTILITY_IPC.registerDropZone, input),
            tabReady: (windowId, tabId) => ipcRenderer.invoke(ASSISTANT_UTILITY_IPC.tabReady, windowId, tabId),
            updateTab: (windowId, tabId, patch) => ipcRenderer.invoke(ASSISTANT_UTILITY_IPC.updateTab, windowId, tabId, patch),
            updateStateCapsule: (windowId, tabId, capsule) => ipcRenderer.invoke(ASSISTANT_UTILITY_IPC.updateStateCapsule, windowId, tabId, capsule),
            addTab: (input: AssistantUtilityAddTabInput) => ipcRenderer.invoke(ASSISTANT_UTILITY_IPC.addTab, input),
            detachMainTab: (input: AssistantUtilityMainTabInput) => ipcRenderer.invoke(ASSISTANT_UTILITY_IPC.detachMainTab, input),
            beginTearOff: (input: AssistantUtilityTearOffBeginInput) => ipcRenderer.invoke(ASSISTANT_UTILITY_IPC.beginTearOff, input),
            finishTearOff: (input: AssistantUtilityTearOffFinishInput) => ipcRenderer.invoke(ASSISTANT_UTILITY_IPC.finishTearOff, input),
            cancelTearOff: (sessionId: string) => ipcRenderer.invoke(ASSISTANT_UTILITY_IPC.cancelTearOff, sessionId),
            completeIncomingMainTab: (requestId, accepted, error) => ipcRenderer.invoke(ASSISTANT_UTILITY_IPC.completeIncomingMainTab, requestId, accepted, error),
            onStateChange: (callback: (state: AssistantUtilityWindowState) => void) => {
                const listener = (_event: Electron.IpcRendererEvent, state: AssistantUtilityWindowState) => callback(state)
                ipcRenderer.on(ASSISTANT_UTILITY_IPC.changed, listener)
                return () => ipcRenderer.removeListener(ASSISTANT_UTILITY_IPC.changed, listener)
            },
            onIncomingMainTab: (callback: (input: { requestId: string; tab: AssistantUtilityTab }) => void) => {
                const listener = (_event: Electron.IpcRendererEvent, input: { requestId: string; tab: AssistantUtilityTab }) => callback(input)
                ipcRenderer.on(ASSISTANT_UTILITY_IPC.incomingMainTab, listener)
                return () => ipcRenderer.removeListener(ASSISTANT_UTILITY_IPC.incomingMainTab, listener)
            },
            onCancelIncomingMainTab: (callback: (input: { requestId: string; tabId: string }) => void) => {
                const listener = (_event: Electron.IpcRendererEvent, input: { requestId: string; tabId: string }) => callback(input)
                ipcRenderer.on(ASSISTANT_UTILITY_IPC.cancelIncomingMainTab, listener)
                return () => ipcRenderer.removeListener(ASSISTANT_UTILITY_IPC.cancelIncomingMainTab, listener)
            }
        }
    }
}
