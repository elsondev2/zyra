import { contextBridge, ipcRenderer } from 'electron'
import { BROWSER_RECORDING_OVERLAY_IPC as IPC, isBrowserRecordingOverlayCommand, type BrowserRecordingOverlayApi, type BrowserRecordingOverlayState } from '../shared/contracts/browser-recording-overlay'

export function installBrowserRecordingOverlayPreload() {
    const api: BrowserRecordingOverlayApi = {
        getState: () => ipcRenderer.invoke(IPC.read),
        onState: listener => {
            const receive = (_event: Electron.IpcRendererEvent, state: BrowserRecordingOverlayState) => listener(state)
            ipcRenderer.on(IPC.state, receive)
            return () => { ipcRenderer.removeListener(IPC.state, receive) }
        },
        command: command => { if (isBrowserRecordingOverlayCommand(command)) ipcRenderer.send(IPC.action, command) },
        resize: size => {
            if (size && Number.isFinite(size.width) && Number.isFinite(size.height)) {
                ipcRenderer.send(IPC.resize, { width: size.width, height: size.height })
            }
        }
    }
    contextBridge.exposeInMainWorld('zyraRecordingOverlay', api)
}
