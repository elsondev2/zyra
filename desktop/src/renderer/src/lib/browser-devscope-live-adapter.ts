import type { DevScopeApi } from '@shared/contracts/devscope-api'
import {
    BROWSER_ASSISTANT_BRIDGE_HEADER,
    BROWSER_ASSISTANT_BRIDGE_HEADER_VALUE,
    BROWSER_ASSISTANT_BRIDGE_PROXY_PREFIX,
    BROWSER_DEVSCOPE_BRIDGE_INVOKE_PATH,
    type BrowserAssistantBridgeInvokeResponse
} from '@shared/browser-assistant-bridge'

const MAX_CONCURRENT_BROWSER_ACTIONS = 2
const MAX_CONCURRENT_BACKGROUND_BROWSER_ACTIONS = 1
const DEFAULT_BROWSER_ACTION_TIMEOUT_MS = 2 * 60_000
const INTERACTIVE_BROWSER_ACTION_TIMEOUT_MS = 10 * 60_000
const PRIORITY_ACTION_PREFIXES = [
    'select', 'open', 'launch', 'install', 'save', 'write', 'create', 'update',
    'delete', 'remove', 'rename', 'move', 'copy', 'check', 'generate', 'test',
    'set', 'add', 'clear', 'stop', 'start', 'run', 'execute', 'import', 'export',
    'apply', 'cancel', 'respond'
]

type BrowserActionTask = {
    priority: boolean
    run: () => void
}

const browserActionQueue: BrowserActionTask[] = []
const inFlightBackgroundBrowserActions = new Map<string, Promise<unknown>>()
let activeBrowserActions = 0
let activeBackgroundBrowserActions = 0

function isPriorityBrowserAction(path: string[]): boolean {
    const method = path[path.length - 1] || ''
    return method === 'getUserHomePath'
        || method.startsWith('listInstalled')
        || PRIORITY_ACTION_PREFIXES.some((prefix) => method.startsWith(prefix))
}

function drainBrowserActionQueue(): void {
    while (activeBrowserActions < MAX_CONCURRENT_BROWSER_ACTIONS && browserActionQueue.length > 0) {
        const priorityIndex = browserActionQueue.findIndex((task) => task.priority)
        const taskIndex = priorityIndex >= 0
            ? priorityIndex
            : activeBackgroundBrowserActions < MAX_CONCURRENT_BACKGROUND_BROWSER_ACTIONS ? 0 : -1
        if (taskIndex < 0) return
        const [task] = browserActionQueue.splice(taskIndex, 1)
        activeBrowserActions += 1
        if (!task.priority) activeBackgroundBrowserActions += 1
        task.run()
    }
}

function getBrowserActionTimeout(path: string[]): number {
    return ['selectFolder', 'selectMarkdownFile', 'selectProjectIconFile'].includes(path[path.length - 1])
        ? INTERACTIVE_BROWSER_ACTION_TIMEOUT_MS
        : DEFAULT_BROWSER_ACTION_TIMEOUT_MS
}

function scheduleBrowserDevscope(path: string[], args: unknown[], priority: boolean): Promise<unknown> {
    return new Promise((resolve, reject) => {
        browserActionQueue.push({
            priority,
            run: () => {
                const controller = new AbortController()
                const timer = window.setTimeout(() => controller.abort(), getBrowserActionTimeout(path))
                void fetch(`${BROWSER_ASSISTANT_BRIDGE_PROXY_PREFIX}${BROWSER_DEVSCOPE_BRIDGE_INVOKE_PATH}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        [BROWSER_ASSISTANT_BRIDGE_HEADER]: BROWSER_ASSISTANT_BRIDGE_HEADER_VALUE
                    },
                    body: JSON.stringify({ path, args }),
                    signal: controller.signal
                }).then(async (response) => {
                    const payload = await response.json() as BrowserAssistantBridgeInvokeResponse
                    if (!response.ok || !payload.ok) {
                        throw new Error(payload.ok ? `Browser action failed (${response.status}).` : payload.error)
                    }
                    resolve(payload.value)
                }).catch((error) => {
                    reject(error instanceof DOMException && error.name === 'AbortError'
                        ? new Error(`Browser action ${path.join('.')} timed out.`)
                        : error)
                }).finally(() => {
                    window.clearTimeout(timer)
                    activeBrowserActions = Math.max(0, activeBrowserActions - 1)
                    if (!priority) activeBackgroundBrowserActions = Math.max(0, activeBackgroundBrowserActions - 1)
                    drainBrowserActionQueue()
                })
            }
        })
        drainBrowserActionQueue()
    })
}

function invokeBrowserDevscope(path: string[], args: unknown[]): Promise<unknown> {
    const priority = isPriorityBrowserAction(path)
    if (priority) return scheduleBrowserDevscope(path, args, true)

    let key: string | null = null
    try {
        key = JSON.stringify({ path, args })
    } catch {}
    if (key) {
        const existing = inFlightBackgroundBrowserActions.get(key)
        if (existing) return existing
    }
    const request = scheduleBrowserDevscope(path, args, false)
    if (key) {
        inFlightBackgroundBrowserActions.set(key, request)
        void request.finally(() => inFlightBackgroundBrowserActions.delete(key!)).catch(() => undefined)
    }
    return request
}

function eventFallback(value: unknown): (...args: unknown[]) => () => void {
    return typeof value === 'function'
        ? value as (...args: unknown[]) => () => void
        : () => () => {}
}

export function createLiveBrowserDevscopeAdapter(base: DevScopeApi): DevScopeApi {
    const namespaceCache = new Map<string, object>()
    return new Proxy(base as unknown as Record<string, unknown>, {
        get(target, property) {
            if (property === 'then') return undefined
            if (typeof property !== 'string') return Reflect.get(target, property)
            const value = target[property]
            if (property === 'window' || property === 'assistant' || property === 'agentControl' || property === 'updates') return value
            if (property.startsWith('on')) return eventFallback(value)
            if (value && typeof value === 'object') {
                const cached = namespaceCache.get(property)
                if (cached) return cached
                const namespace = new Proxy(value as Record<string, unknown>, {
                    get(namespaceTarget, method) {
                        if (method === 'then') return undefined
                        if (typeof method !== 'string') return Reflect.get(namespaceTarget, method)
                        const fallback = namespaceTarget[method]
                        if (method.startsWith('on')) return eventFallback(fallback)
                        return (...args: unknown[]) => invokeBrowserDevscope([property, method], args)
                    }
                })
                namespaceCache.set(property, namespace)
                return namespace
            }
            return (...args: unknown[]) => invokeBrowserDevscope([property], args)
        }
    }) as unknown as DevScopeApi
}
