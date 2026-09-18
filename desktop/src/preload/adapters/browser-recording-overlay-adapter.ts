import { ipcRenderer } from 'electron'
import { BROWSER_RECORDING_OVERLAY_IPC as IPC, type BrowserRecordingOverlayCommand, type BrowserRecordingOverlayPresentation, type BrowserRecordingOverlayState } from '../../shared/contracts/browser-recording-overlay'

export function createBrowserRecordingOverlayAdapter() {
    return {
        setBrowserRecordingOverlay: (state: BrowserRecordingOverlayState | null) => ipcRenderer.invoke(IPC.update, state),
        onBrowserRecordingOverlayPresentation: (listener: (presentation: BrowserRecordingOverlayPresentation) => void) => {
            const receive = (_event: Electron.IpcRendererEvent, presentation: BrowserRecordingOverlayPresentation) => listener(presentation)
            ipcRenderer.on(IPC.presentation, receive)
            return () => { ipcRenderer.removeListener(IPC.presentation, receive) }
        },
        onBrowserRecordingOverlayCommand: (listener: (command: BrowserRecordingOverlayCommand) => void) => {
            const receive = (_event: Electron.IpcRendererEvent, command: BrowserRecordingOverlayCommand) => listener(command)
            ipcRenderer.on(IPC.command, receive)
            return () => { ipcRenderer.removeListener(IPC.command, receive) }
        }
    }
}
