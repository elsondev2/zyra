import { ipcRenderer } from 'electron'
import { MOBILE_ACCESS_IPC, type MobileAccessApi } from '../../shared/mobile-access'
export function createMobileAccessAdapter(): MobileAccessApi {
    return {
        setDeviceAccess: (id, access) => ipcRenderer.invoke(MOBILE_ACCESS_IPC, 'device-access', { id, access }),
        getProjects: () => ipcRenderer.invoke(MOBILE_ACCESS_IPC, 'projects'),
        getState: () => ipcRenderer.invoke(MOBILE_ACCESS_IPC, 'state'),
        configure: config => ipcRenderer.invoke(MOBILE_ACCESS_IPC, 'configure', config),
        pair: () => ipcRenderer.invoke(MOBILE_ACCESS_IPC, 'pair'),
        revoke: id => ipcRenderer.invoke(MOBILE_ACCESS_IPC, 'revoke', id)
    }
}
