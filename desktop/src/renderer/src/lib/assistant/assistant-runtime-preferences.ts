const SETTINGS_STORAGE_KEY = 'devscope-settings'
let canonicalAutoReconnect: boolean | null = null

export function setCanonicalAssistantAutoReconnectPreference(value: boolean): void {
    canonicalAutoReconnect = value
}

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
    if (canonicalAutoReconnect !== null) return canonicalAutoReconnect
    // Compatibility fallback for startup tests and the one-time Desktop v4 migration.
    return readStoredSettings()['assistantAutoReconnect'] !== false
}
