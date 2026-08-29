export type AnalyticsSource = 'desktop_main' | 'desktop_renderer' | 'cli'
export type AnalyticsStatus = {
    requested: boolean
    preferenceSet: boolean
    enabled: boolean
    configured: boolean
    reason: string
    hostCategory: string
    enabledSource: 'environment' | 'persisted'
    canChangeEnabled: boolean
    queueSize: number
    catalogId: string
}
export type AnalyticsTransport = (input: {
    url: string
    payload: Record<string, unknown>
    timeoutMs: number
    signal?: AbortSignal
}) => Promise<{ ok: boolean; retryable: boolean }>
export type ProductAnalyticsOptions = {
    storageDirectory: string
    configPath?: string
    preferencePath?: string
    requireExplicitPreference?: boolean
    source: AnalyticsSource
    appVersion: string
    platform?: string
    architecture?: string
    env?: Record<string, string | undefined>
    transport?: AnalyticsTransport
    fetch?: typeof fetch
    now?: () => Date
    randomUUID?: () => string
    sleep?: (milliseconds: number) => Promise<void>
    setTimer?: typeof setTimeout
    clearTimer?: typeof clearTimeout
    batchSize?: number
    maxQueueSize?: number
    maxEventAgeMs?: number
    flushIntervalMs?: number
    inactiveRefreshIntervalMs?: number
    retryDelaysMs?: number[]
    autoFlush?: boolean
}
export class ProductAnalyticsClient {
    constructor(options: ProductAnalyticsOptions)
    initialize(): Promise<void>
    status(): AnalyticsStatus
    refreshStatus(): Promise<AnalyticsStatus>
    updateEnabled(enabled: boolean): Promise<AnalyticsStatus>
    capture(event: string, properties?: Record<string, unknown>): Promise<boolean>
    flush(options?: { maxAttempts?: number }): Promise<boolean>
    shutdown(options?: { timeoutMs?: number }): Promise<void>
}
export function createProductAnalytics(options: ProductAnalyticsOptions): ProductAnalyticsClient
export function normalizeAnalyticsPlatform(value: unknown): 'win32' | 'darwin' | 'linux' | 'other'
export function normalizeAnalyticsArchitecture(value: unknown): 'x64' | 'arm64' | 'ia32' | 'other'
export function resolveAnalyticsConfig(input?: {
    env?: Record<string, string | undefined>
    persisted?: unknown
}): Record<string, unknown>
export function validatePostHogEndpoint(value: unknown, customAllowedHosts?: string[]): Record<string, unknown>
export function createFetchTransport(fetchImplementation?: typeof fetch): AnalyticsTransport
