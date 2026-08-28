import { contextBridge, ipcRenderer } from 'electron'
import { createBrowserPopupAdapter } from './adapters/browser-popup-adapter'
import { createWindowAdapter } from './adapters/window-adapter'
import {
    DEVICE_PREFERENCES_IPC,
    type DevicePreferencesChangedEvent
} from '../shared/preferences/contracts'

const unavailable = () => Promise.resolve({
    success: false as const,
    error: 'This operation is unavailable in a Browser popup window.'
})

export function installBrowserPopupPreload(): void {
    // Popup chrome is trusted local UI, but it receives only window controls,
    // popup navigation, main-owned Browser download controls, and read-only appearance preferences. The remote website
    // runs in a separate sandboxed WebContentsView with no preload at all.
    contextBridge.exposeInMainWorld('devscope', {
        ...createWindowAdapter(),
        browserPopup: createBrowserPopupAdapter(),
        preferences: {
            get: () => ipcRenderer.invoke(DEVICE_PREFERENCES_IPC.get, { surface: 'desktop' }),
            update: unavailable,
            onChanged: (callback: (event: DevicePreferencesChangedEvent) => void) => {
                const listener = (_event: Electron.IpcRendererEvent, payload: DevicePreferencesChangedEvent) => callback(payload)
                ipcRenderer.on(DEVICE_PREFERENCES_IPC.changed, listener)
                return () => ipcRenderer.removeListener(DEVICE_PREFERENCES_IPC.changed, listener)
            }
        },
        secrets: {
            updateHostedAiKeys: unavailable,
            migrateLegacyHostedAiKeys: unavailable,
            updateBrowserIntegrationSecrets: unavailable
        }
    })
}
