const SETTINGS_STORAGE_KEY = 'devscope-settings'

function readStoredSettings(): Record<string, unknown> {
    try {
        const raw = window.localStorage?.getItem(SETTINGS_STORAGE_KEY)
        const parsed = raw ? JSON.parse(raw) : null
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {}
    } catch {
        return {}
    }
}

export function shouldAutoReconnectAssistantOnStartup(): boolean {
    return readStoredSettings()['assistantAutoReconnect'] !== false
}
