import {
    BROWSER_ASSISTANT_BRIDGE_PROXY_PREFIX,
    BROWSER_FILE_BRIDGE_PATH
} from '@shared/browser-assistant-bridge'

export function isElectronRendererRuntime(): boolean {
    return typeof navigator !== 'undefined' && /\bElectron\//i.test(navigator.userAgent)
}

export function projectLocalFileUrl(source: string): string {
    const value = String(source || '').trim()
    if (!value || typeof window === 'undefined' || isElectronRendererRuntime()) return value
    let zyraSource = value.startsWith('devscope://')
        ? `zyra://${value.slice('devscope://'.length)}`
        : value
    if (zyraSource.startsWith('file://')) {
        try {
            const fileUrl = new URL(zyraSource)
            zyraSource = `zyra://${fileUrl.host}${fileUrl.pathname}${fileUrl.search}`
        } catch {
            return value
        }
    }
    if (!zyraSource.startsWith('zyra://')) return value
    const prefix = window.location?.protocol === 'chrome-extension:' ? '/__zyra_browser_assistant' : BROWSER_ASSISTANT_BRIDGE_PROXY_PREFIX
    return `${prefix}${BROWSER_FILE_BRIDGE_PATH}?source=${encodeURIComponent(zyraSource)}`
}
