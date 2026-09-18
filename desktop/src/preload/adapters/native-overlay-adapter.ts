import { ipcRenderer } from 'electron'
import { NATIVE_OVERLAY_IPC as IPC, type NativeOverlayApi, type NativeOverlayDismiss, type NativeOverlayLinkActivation } from '../../shared/contracts/native-overlay'

export function createNativeOverlayAdapter(): NativeOverlayApi {
    return {
        prepareNativeOverlay: input => ipcRenderer.invoke(IPC.prepare, input),
        recoverNativeOverlay: input => ipcRenderer.invoke(IPC.recover, input),
        setNativeOverlayVisible: input => ipcRenderer.invoke(IPC.visibility, input),
        onNativeOverlayDismiss: listener => {
            const receive = (_event: Electron.IpcRendererEvent, dismissal: NativeOverlayDismiss) => listener(dismissal)
            ipcRenderer.on(IPC.dismissed, receive)
            return () => { ipcRenderer.removeListener(IPC.dismissed, receive) }
        },
        onNativeOverlayLinkActivated: listener => {
            const receive = (_event: Electron.IpcRendererEvent, activation: NativeOverlayLinkActivation) => listener(activation)
            ipcRenderer.on(IPC.linkActivated, receive)
            return () => { ipcRenderer.removeListener(IPC.linkActivated, receive) }
        }
    }
}
