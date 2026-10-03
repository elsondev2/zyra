import { ipcRenderer } from 'electron'

export function createMemoryAdapter() {
    return {
        memory: {
            getJobStatus: () => ipcRenderer.invoke('zyra:memory:getJobStatus'),
            getOverview: () => ipcRenderer.invoke('zyra:memory:getOverview'),
            getModelPreference: () => ipcRenderer.invoke('zyra:memory:getModelPreference'),
            setModelPreference: (preference: string) => ipcRenderer.invoke('zyra:memory:setModelPreference', preference)
        }
    }
}
