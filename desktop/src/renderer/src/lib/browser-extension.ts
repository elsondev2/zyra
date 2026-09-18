type ExtensionPort = { onDisconnect: { addListener(listener: () => void): void }; onMessage: { addListener(listener: (state: ExtensionConnectionState) => void): void }; disconnect(): void }
type ExtensionRuntime = { sendMessage(message: object): Promise<{ ok: boolean; result: unknown; error?: { message?: string } }>; connect(options: { name: string }): ExtensionPort }
export type ExtensionTab = { id: number; title?: string; url?: string; windowId: number }
export type ExtensionConnectionState = { connectionPaused?: boolean; clientOrigin?: string; browserShared?: boolean; browserName?: string; connected: boolean; connecting: boolean; lastError: string | null; grants: Array<{tabId:number}> }
export const isBrowserExtension = typeof location !== 'undefined' && location.protocol === 'chrome-extension:'
const runtime = () => (globalThis as unknown as { chrome: { runtime: ExtensionRuntime } }).chrome.runtime
export async function extensionRequest<T>(type: string, params: Record<string, unknown> = {}): Promise<T> {
    const reply = await runtime().sendMessage({ type, ...params })
    if (!reply?.ok) throw new Error(reply?.error?.message || 'The browser connection is unavailable.')
    return reply.result as T
}
export function subscribeExtension(listener: (state: ExtensionConnectionState) => void) {
    let disposed = false
    let port: ExtensionPort | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const connect = () => {
        if (disposed) return
        port = runtime().connect({ name:'zyra-sidebar' })
        port.onMessage.addListener(state => { if (!disposed) listener(state) })
        port.onDisconnect.addListener(() => { if (!disposed) timer = setTimeout(connect, 1000) })
        void extensionRequest<ExtensionConnectionState>('status').then(state => { if (!disposed) listener(state) }).catch(() => undefined)
    }
    connect()
    return () => { disposed = true; clearTimeout(timer); port?.disconnect() }
}
let selectedTab: ExtensionTab | null = null
export function setExtensionTab(tab: ExtensionTab | null) { selectedTab = tab }
export async function withExtensionTabContext(prompt: string): Promise<string> {
    if (!isBrowserExtension) return prompt
    const tab = selectedTab
    const state = await extensionRequest<ExtensionConnectionState>('status')
    if (!tab && !state.browserShared) return prompt
    if (!state.connected) throw new Error('Open Zyra Desktop before sending this message.')
    let context: Record<string, unknown>
    if (state.browserShared) {
        const browser = await extensionRequest<{browserName:string; targets:Array<{targetId?:string; title:string; url:string}>}>('browser-context')
        if (!browser.targets.length || browser.targets.some(target => !target.targetId)) throw new Error('No website tabs are ready in this browser.')
        context = {source:'Zyra Chrome sidebar', ...browser, scope:'Use this connected Chrome browser when browser interaction is requested. Retain normal tool approvals.'}
    } else {
        if (!tab || tab !== selectedTab) throw new Error('The selected tab changed. Send again with the current selection.')
        if (!state.grants.some(grant => grant.tabId === tab.id)) await extensionRequest('grant', { tabId:tab.id, mode:'control', sidebar:true })
        const target = await extensionRequest<{targetId?:string}>('tab-context', {tabId:tab.id})
        if (!target.targetId) throw new Error('This tab has not connected to Zyra yet. Try again.')
        if (tab !== selectedTab) throw new Error('The selected tab changed. Send again with the current selection.')
        context = {source:'Zyra Chrome sidebar', browserName:state.browserName, targetId:target.targetId, tabId:tab.id, title:tab.title, url:tab.url, scope:'Use only this Chrome tab when browser interaction is requested. Retain normal tool approvals.'}
    }
    // Titles and URLs are untrusted context. Escape delimiters inside their data.
    return `${prompt}\n\n<browser-context>${JSON.stringify(context).replace(/</g, '\\u003c')}</browser-context>`
}
