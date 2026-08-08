export const FULL_ACCESS_CONFIRM_SUPPRESSED_KEY = 'zyra-ui:full-access-confirm-suppressed:v1'

export function readFullAccessConfirmSuppressed(): boolean {
    try {
        return window.localStorage.getItem(FULL_ACCESS_CONFIRM_SUPPRESSED_KEY) === 'true'
    } catch {
        return false
    }
}

export function writeFullAccessConfirmSuppressed(value: boolean): void {
    try {
        if (value) window.localStorage.setItem(FULL_ACCESS_CONFIRM_SUPPRESSED_KEY, 'true')
        else window.localStorage.removeItem(FULL_ACCESS_CONFIRM_SUPPRESSED_KEY)
    } catch {
        // Keep full-access controls usable if localStorage is unavailable.
    }
}
