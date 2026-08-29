import { ipcRenderer } from 'electron'
import type { DevScopeBrowserPopupApi } from '../../shared/contracts/devscope-api'
import {
    BROWSER_DOWNLOADS_ACTION_CHANNEL,
    BROWSER_DOWNLOADS_CHANGED_CHANNEL,
    BROWSER_DOWNLOADS_LIST_CHANNEL,
    type BrowserDownloadRecord
} from '../../shared/browser-downloads'
import {
    BROWSER_POPUP_COMMAND_CHANNEL,
    BROWSER_POPUP_FOCUS_ADDRESS_CHANNEL,
    BROWSER_POPUP_FOCUS_WINDOW_CHANNEL,
    BROWSER_POPUP_GET_STATE_CHANNEL,
    BROWSER_POPUP_LIST_CHANGED_CHANNEL,
    BROWSER_POPUP_LIST_CHANNEL,
    BROWSER_POPUP_STATE_CHANGED_CHANNEL,
    type BrowserPopupState,
    type BrowserPopupSummary
} from '../../shared/browser-popup'

export function createBrowserPopupAdapter(): DevScopeBrowserPopupApi {
    return {
        getState: () => ipcRenderer.invoke(BROWSER_POPUP_GET_STATE_CHANNEL),
        command: (command) => ipcRenderer.invoke(BROWSER_POPUP_COMMAND_CHANNEL, command),
        listOpenWindows: () => ipcRenderer.invoke(BROWSER_POPUP_LIST_CHANNEL),
        focusWindow: (id) => ipcRenderer.invoke(BROWSER_POPUP_FOCUS_WINDOW_CHANNEL, id),
        listDownloads: () => ipcRenderer.invoke(BROWSER_DOWNLOADS_LIST_CHANNEL),
        actOnDownload: (action) => ipcRenderer.invoke(BROWSER_DOWNLOADS_ACTION_CHANNEL, action),
        onDownloadsChanged: (callback) => {
            const listener = (_event: Electron.IpcRendererEvent, downloads: BrowserDownloadRecord[]) => callback(downloads)
            ipcRenderer.on(BROWSER_DOWNLOADS_CHANGED_CHANNEL, listener)
            return () => ipcRenderer.removeListener(BROWSER_DOWNLOADS_CHANGED_CHANNEL, listener)
        },
        onStateChange: (callback) => {
            const listener = (_event: Electron.IpcRendererEvent, state: BrowserPopupState) => callback(state)
            ipcRenderer.on(BROWSER_POPUP_STATE_CHANGED_CHANNEL, listener)
            return () => ipcRenderer.removeListener(BROWSER_POPUP_STATE_CHANGED_CHANNEL, listener)
        },
        onFocusAddress: (callback) => {
            const listener = () => callback()
            ipcRenderer.on(BROWSER_POPUP_FOCUS_ADDRESS_CHANNEL, listener)
            return () => ipcRenderer.removeListener(BROWSER_POPUP_FOCUS_ADDRESS_CHANNEL, listener)
        },
        onOpenWindowsChange: (callback) => {
            const listener = (_event: Electron.IpcRendererEvent, windows: BrowserPopupSummary[]) => callback(windows)
            ipcRenderer.on(BROWSER_POPUP_LIST_CHANGED_CHANNEL, listener)
            return () => ipcRenderer.removeListener(BROWSER_POPUP_LIST_CHANGED_CHANNEL, listener)
        }
    }
}
