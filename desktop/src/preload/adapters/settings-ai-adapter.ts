import { ipcRenderer } from 'electron'

export function createSettingsAndAiAdapter() {
    return {
        setStartupSettings: (settings: { openAtLogin: boolean; openAsHidden: boolean }) =>
            ipcRenderer.invoke('devscope:setStartupSettings', settings),
        getStartupSettings: () => ipcRenderer.invoke('devscope:getStartupSettings'),
        getAiDebugLogs: (limit?: number) => ipcRenderer.invoke('devscope:getAiDebugLogs', limit),
        clearAiDebugLogs: () => ipcRenderer.invoke('devscope:clearAiDebugLogs'),
        testGroqConnection: (apiKey: string) => ipcRenderer.invoke('devscope:testGroqConnection', apiKey),
        testGeminiConnection: (apiKey: string) => ipcRenderer.invoke('devscope:testGeminiConnection', apiKey),
        testCodexConnection: (model?: string) => ipcRenderer.invoke('devscope:testCodexConnection', model),
        generateCommitMessage: (provider: 'groq' | 'gemini' | 'codex', apiKey: string, diff: string, model?: string) =>
            ipcRenderer.invoke('devscope:generateCommitMessage', provider, apiKey, diff, model)
    }
}
