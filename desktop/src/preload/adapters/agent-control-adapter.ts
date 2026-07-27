import { ipcRenderer } from 'electron'
import type { ControlStateSnapshot, ControlWindowCandidate } from '../../shared/agent-control/contracts'
import { AGENT_CONTROL_IPC, type RendererControlGrantInput } from '../../shared/agent-control/protocol'

export function createAgentControlAdapter() {
    return {
        getState: () => ipcRenderer.invoke(AGENT_CONTROL_IPC.getState),
        bindBrowserTab: (input: { guestWebContentsId: number; tabId: string }) => ipcRenderer.invoke(AGENT_CONTROL_IPC.bindBrowserTab, input),
        approveGrant: (input: RendererControlGrantInput) => ipcRenderer.invoke(AGENT_CONTROL_IPC.approveGrant, input),
        rejectGrant: (requestId: string) => ipcRenderer.invoke(AGENT_CONTROL_IPC.rejectGrant, requestId),
        revokeGrant: (grantId: string) => ipcRenderer.invoke(AGENT_CONTROL_IPC.revokeGrant, grantId),
        emergencyStop: () => ipcRenderer.invoke(AGENT_CONTROL_IPC.emergencyStop),
        clearAudit: () => ipcRenderer.invoke(AGENT_CONTROL_IPC.clearAudit),
        startChromePairing: () => ipcRenderer.invoke(AGENT_CONTROL_IPC.startChromePairing),
        stopChromePairing: () => ipcRenderer.invoke(AGENT_CONTROL_IPC.stopChromePairing),
        listWindows: () => ipcRenderer.invoke(AGENT_CONTROL_IPC.listWindows) as Promise<{ success: boolean; windows?: ControlWindowCandidate[]; error?: string }>,
        selectWindow: (windowToken: string) => ipcRenderer.invoke(AGENT_CONTROL_IPC.selectWindow, windowToken),
        onStateChange: (callback: (state: ControlStateSnapshot) => void) => {
            const listener = (_event: Electron.IpcRendererEvent, state: ControlStateSnapshot) => callback(state)
            ipcRenderer.on(AGENT_CONTROL_IPC.stateChanged, listener)
            return () => ipcRenderer.removeListener(AGENT_CONTROL_IPC.stateChanged, listener)
        }
    }
}
