import { ipcRenderer } from 'electron'
import type { DevScopeFontsApi } from '../../shared/contracts/font-contracts'

export function createFontsAdapter(): DevScopeFontsApi {
    return {
        listManaged: () => ipcRenderer.invoke('devscope:fonts:listManaged'),
        listSystem: () => ipcRenderer.invoke('devscope:fonts:listSystem'),
        downloadGoogle: (family) => ipcRenderer.invoke('devscope:fonts:downloadGoogle', family),
        importFile: () => ipcRenderer.invoke('devscope:fonts:importFile'),
        removeManaged: (fontId) => ipcRenderer.invoke('devscope:fonts:removeManaged', fontId),
        readManaged: (fontId) => ipcRenderer.invoke('devscope:fonts:readManaged', fontId)
    }
}
