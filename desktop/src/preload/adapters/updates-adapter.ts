import { ipcRenderer } from 'electron'
import type { DevScopeUpdateState } from '../../shared/contracts/devscope-api'

const UPDATE_STATE_CHANNEL = 'devscope:updates:state'

export function createUpdatesAdapter() {
    return {
        updates: {
            getState: () => ipcRenderer.invoke('devscope:updates:getState'),
            checkForUpdates: () => ipcRenderer.invoke('devscope:updates:checkForUpdates'),
            downloadUpdate: () => ipcRenderer.invoke('devscope:updates:downloadUpdate'),
            installUpdate: () => ipcRenderer.invoke('devscope:updates:installUpdate'),
            onStateChange: (callback: (state: DevScopeUpdateState) => void) => {
                const listener = (_event: Electron.IpcRendererEvent, payload: DevScopeUpdateState) => {
                    callback(payload)
                }
                ipcRenderer.on(UPDATE_STATE_CHANNEL, listener)
                return () => {
                    ipcRenderer.removeListener(UPDATE_STATE_CHANNEL, listener)
                }
            }
        }
    }
}
