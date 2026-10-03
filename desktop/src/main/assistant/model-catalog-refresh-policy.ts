export const ASSISTANT_MODEL_CATALOG_REFRESH_INTERVAL_MS = 15 * 60_000
export const ASSISTANT_MODEL_CATALOG_RETRY_INTERVAL_MS = 60_000

export function isAssistantModelCatalogRefreshDue(lastAttemptAt: number, now = Date.now(), lastRefreshFailed = false): boolean {
    return !Number.isFinite(lastAttemptAt)
        || lastAttemptAt <= 0
        || now - lastAttemptAt >= (lastRefreshFailed ? ASSISTANT_MODEL_CATALOG_RETRY_INTERVAL_MS : ASSISTANT_MODEL_CATALOG_REFRESH_INTERVAL_MS)
}
