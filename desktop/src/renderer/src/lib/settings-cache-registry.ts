const settingsCacheClearers = new Map<string, () => void>()

export function registerSettingsCacheClearer(key: string, clear: () => void): () => void {
    settingsCacheClearers.set(key, clear)
    return () => {
        if (settingsCacheClearers.get(key) === clear) settingsCacheClearers.delete(key)
    }
}

export function clearSettingsRuntimeCaches(): void {
    for (const clear of settingsCacheClearers.values()) {
        try {
            clear()
        } catch {
            // Cache clearing stays best-effort and must not block the Settings action.
        }
    }
}
