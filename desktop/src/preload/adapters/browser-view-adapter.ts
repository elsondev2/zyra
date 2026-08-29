import { ipcRenderer } from 'electron'
import {
    BROWSER_VIEW_IPC,
    type BrowserViewApi,
    type BrowserViewCommand,
    type BrowserViewEnsureInput,
    type BrowserViewEvent,
    type BrowserViewSlotInput
} from '../../shared/browser-view'

export function createBrowserViewAdapter(): { browserView: BrowserViewApi } {
    return {
        browserView: {
            ensure: (input: BrowserViewEnsureInput) => ipcRenderer.invoke(BROWSER_VIEW_IPC.ensure, input),
            command: (command: BrowserViewCommand) => ipcRenderer.invoke(BROWSER_VIEW_IPC.command, command),
            close: (tabId: string) => ipcRenderer.invoke(BROWSER_VIEW_IPC.close, tabId),
            release: (tabId: string) => ipcRenderer.send(BROWSER_VIEW_IPC.release, tabId),
            reportSlot: (input: BrowserViewSlotInput) => ipcRenderer.send(BROWSER_VIEW_IPC.reportSlot, input),
            onEvent: (callback: (event: BrowserViewEvent) => void) => {
                const listener = (_event: Electron.IpcRendererEvent, browserEvent: BrowserViewEvent) => callback(browserEvent)
                ipcRenderer.on(BROWSER_VIEW_IPC.event, listener)
                return () => ipcRenderer.removeListener(BROWSER_VIEW_IPC.event, listener)
            }
        }
    }
}
