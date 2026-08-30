import { contextBridge, ipcRenderer } from 'electron'
import {
    ANALYTICS_IPC,
    type DesktopAnalyticsApi
} from '../shared/analytics/contracts'

export function installDesktopAnalytics(): void {
    const api: DesktopAnalyticsApi = {
        getStatus: () => ipcRenderer.invoke(ANALYTICS_IPC.getStatus),
        setEnabled: (enabled) => ipcRenderer.invoke(ANALYTICS_IPC.setEnabled, enabled),
        capture: (input) => ipcRenderer.invoke(ANALYTICS_IPC.capture, input),
        onStatusChange: (callback) => {
            const listener = (_event: Electron.IpcRendererEvent, status: Parameters<typeof callback>[0]) => callback(status)
            ipcRenderer.on(ANALYTICS_IPC.statusChanged, listener)
            return () => ipcRenderer.removeListener(ANALYTICS_IPC.statusChanged, listener)
        }
    }
    contextBridge.exposeInMainWorld('zyraAnalytics', api)
}
