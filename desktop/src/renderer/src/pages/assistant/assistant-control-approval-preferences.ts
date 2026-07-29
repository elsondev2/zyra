import { CONTROL_CAPABILITIES, type ControlCapability, type ControlPendingGrant, type ControlTarget } from '@shared/agent-control/contracts'

const STORAGE_KEY = 'zyra:browser-control-approval-preferences:v1'
const CHANGE_EVENT = 'zyra:browser-control-approval-preferences-changed'
const MAX_PREFERENCES = 50

export type BrowserControlApprovalPreference = {
    version: 1
    origin: string
    principalType: 'root'
    capabilities: ControlCapability[]
    maxActions: number
    durationMs: number
    createdAt: string
}

export function readBrowserControlApprovalPreferences(): BrowserControlApprovalPreference[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
        if (!Array.isArray(parsed)) return []
        return parsed.flatMap((value): BrowserControlApprovalPreference[] => {
            if (!value || typeof value !== 'object' || value.version !== 1 || value.principalType !== 'root') return []
            const origin = normalizeOrigin(value.origin)
            const capabilities: ControlCapability[] = Array.isArray(value.capabilities)
                ? value.capabilities.filter((entry: unknown): entry is ControlCapability => (
                    typeof entry === 'string' && (CONTROL_CAPABILITIES as readonly string[]).includes(entry)
                )).slice(0, 16)
                : []
            const maxActions = Math.max(1, Math.min(500, Math.floor(Number(value.maxActions) || 1)))
            const durationMs = Math.max(1_000, Math.min(30 * 60 * 1000, Math.floor(Number(value.durationMs) || 1_000)))
            if (!origin || capabilities.length === 0) return []
            return [{
                version: 1,
                origin,
                principalType: 'root',
                capabilities: [...new Set(capabilities)].sort(),
                maxActions,
                durationMs,
                createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString()
            }]
        }).slice(-MAX_PREFERENCES)
    } catch {
        return []
    }
}

export function rememberBrowserControlApproval(input: {
    request: ControlPendingGrant
    target: ControlTarget
    capabilities: ControlCapability[]
    maxActions: number
    durationMs: number
}): void {
    if (input.request.principal.type !== 'root' || input.target.kind !== 'zyra-browser') return
    const origin = normalizeOrigin(input.target.origin)
    if (!origin || !input.request.allowedOrigins?.length || input.request.allowedOrigins.some((entry) => normalizeOrigin(entry) !== origin)) return
    const capabilities = [...new Set(input.capabilities.filter((capability) => input.request.capabilities.includes(capability)))].sort()
    const remainingMs = Math.max(0, Date.parse(input.request.expiresAt) - Date.now())
    if (capabilities.length === 0 || remainingMs < 1_000) return
    const preference: BrowserControlApprovalPreference = {
        version: 1,
        origin,
        principalType: 'root',
        capabilities,
        maxActions: Math.max(1, Math.min(input.request.maxActions, Math.floor(input.maxActions))),
        durationMs: Math.max(1_000, Math.min(30 * 60 * 1000, remainingMs, Math.floor(input.durationMs))),
        createdAt: new Date().toISOString()
    }
    const current = readBrowserControlApprovalPreferences().filter((entry) => !(entry.origin === origin && sameCapabilities(entry.capabilities, preference.capabilities)))
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...current, preference].slice(-MAX_PREFERENCES)))
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

export function findRememberedBrowserControlApproval(
    request: ControlPendingGrant,
    target: ControlTarget
): BrowserControlApprovalPreference | null {
    if (request.principal.type !== 'root' || target.kind !== 'zyra-browser') return null
    const origin = normalizeOrigin(target.origin)
    if (!origin || !request.allowedOrigins?.length || request.allowedOrigins.some((entry) => normalizeOrigin(entry) !== origin)) return null
    return readBrowserControlApprovalPreferences().find((entry) => (
        entry.origin === origin
        && request.capabilities.every((capability) => entry.capabilities.includes(capability))
    )) || null
}

export function clearBrowserControlApprovalPreferences(): void {
    localStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

export function onBrowserControlApprovalPreferencesChange(callback: () => void): () => void {
    window.addEventListener(CHANGE_EVENT, callback)
    return () => window.removeEventListener(CHANGE_EVENT, callback)
}

function normalizeOrigin(value: unknown): string | null {
    try {
        const url = new URL(String(value || ''))
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null
    } catch {
        return null
    }
}

function sameCapabilities(left: ControlCapability[], right: ControlCapability[]): boolean {
    return left.length === right.length && left.every((entry, index) => entry === right[index])
}
