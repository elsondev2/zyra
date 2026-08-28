export type AppLoadingRoute = 'assistant' | 'settings' | 'voice' | 'assistant-utility' | 'browser-popup'

export function resolveAppLoadingRoute(pathOrHash: string): AppLoadingRoute {
    const path = pathOrHash.trim().replace(/^#/, '') || '/assistant'
    if (/^\/browser-popup(?:[/?]|$)/.test(path)) return 'browser-popup'
    if (/^\/assistant-utility(?:[/?]|$)/.test(path)) return 'assistant-utility'
    if (/^\/assistant\/instructor(?:[/?]|$)/.test(path)) return 'voice'
    if (/^\/settings(?:[/?]|$)/.test(path)) return 'settings'
    return 'assistant'
}
