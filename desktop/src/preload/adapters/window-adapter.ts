import { ipcRenderer } from 'electron'

export function createWindowAdapter() {
    return {
        window: {
            minimize: () => ipcRenderer.send('window:minimize'),
            maximize: () => ipcRenderer.send('window:maximize'),
            close: () => ipcRenderer.send('window:close'),
            isMaximized: () => ipcRenderer.invoke('window:isMaximized')
        }
    }
}
