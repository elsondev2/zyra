import { ipcRenderer } from 'electron'

export function createMemoryAdapter() {
    return {
        memory: {
            getOverview: () => ipcRenderer.invoke('zyra:memory:getOverview')
        }
    }
}
