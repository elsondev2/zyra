import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { app } from 'electron'
import {
    createProductAnalytics,
    normalizeAnalyticsArchitecture,
    normalizeAnalyticsPlatform,
    type AnalyticsStatus,
    type ProductAnalyticsClient
} from '../../../../src/analytics/client.mjs'
import { withBundledReleaseAnalyticsConfig } from '../../../../src/analytics/release-config.mjs'
import type { AnalyticsEventInput, AnalyticsEventName } from '../../shared/analytics/contracts'

const MAX_RENDERER_EVENT_BYTES = 8 * 1024
const RENDERER_ANALYTICS_EVENTS = new Set(['zyra_v1_files', 'zyra_v1_workspace_ui'])

export class DesktopAnalyticsService {
    private readonly client: ProductAnalyticsClient
    private rendererRateWindowStartedAt = 0
    private rendererRateWindowCount = 0
    private readonly statusListeners = new Set<(status: AnalyticsStatus) => void>()
    private statusRefreshTimer: ReturnType<typeof setInterval> | null = null
    private lastPublishedStatus = ''

    constructor(userDataPath: string, options: {
        client?: ProductAnalyticsClient
        env?: Record<string, string | undefined>
        preferencePath?: string
        useReleaseConfig?: boolean
    } = {}) {
        const baseEnv = options.env || process.env
        const useReleaseConfig = options.useReleaseConfig ?? (app.isPackaged && baseEnv.ZYRA_ANALYTICS_USE_RELEASE_CONFIG !== '0')
        const env = withBundledReleaseAnalyticsConfig(baseEnv, useReleaseConfig)
        const sharedStateRoot = resolve(env.ZYRA_STATE_DIR || join(homedir(), '.zyra'))
        this.client = options.client || createProductAnalytics({
            storageDirectory: join(userDataPath, 'analytics'),
            preferencePath: options.preferencePath || join(sharedStateRoot, 'analytics', 'consent.json'),
            requireExplicitPreference: true,
            source: 'desktop_main',
            appVersion: app.getVersion(),
            platform: process.platform,
            architecture: process.arch,
            env
        })
    }

    async initialize(): Promise<void> {
        await this.client.initialize()
        this.publishStatus(this.client.status())
        if (!this.statusRefreshTimer) {
            this.statusRefreshTimer = setInterval(() => {
                void this.refreshStatus().catch(() => undefined)
            }, 2_000)
            this.statusRefreshTimer.unref?.()
        }
    }

    status(): AnalyticsStatus {
        return this.client.status()
    }

    async refreshStatus(): Promise<AnalyticsStatus> {
        const status = await this.client.refreshStatus()
        this.publishStatus(status)
        return status
    }

    async updateEnabled(enabled: boolean): Promise<AnalyticsStatus> {
        const status = await this.client.updateEnabled(enabled)
        this.publishStatus(status)
        return status
    }

    subscribeStatus(listener: (status: AnalyticsStatus) => void): () => void {
        this.statusListeners.add(listener)
        return () => this.statusListeners.delete(listener)
    }

    capture<Name extends AnalyticsEventName>(input: AnalyticsEventInput<Name>): void {
        void this.client.capture(input.event, input.properties).catch(() => undefined)
    }

    async captureFromRenderer(input: unknown): Promise<boolean> {
        if (!isRecord(input) || typeof input.event !== 'string' || !RENDERER_ANALYTICS_EVENTS.has(input.event) || !isRecord(input.properties)) return false
        let bytes = Number.POSITIVE_INFINITY
        try {
            bytes = Buffer.byteLength(JSON.stringify(input), 'utf8')
        } catch {}
        if (bytes > MAX_RENDERER_EVENT_BYTES) return false
        await this.client.initialize()
        const now = Date.now()
        if (now - this.rendererRateWindowStartedAt >= 60_000) {
            this.rendererRateWindowStartedAt = now
            this.rendererRateWindowCount = 0
        }
        if (this.rendererRateWindowCount >= 120) return false
        this.rendererRateWindowCount += 1
        const accepted = await this.client.capture(input.event, {
            ...input.properties,
            schema_version: 1,
            source: 'desktop_renderer',
            app_version: app.getVersion(),
            platform: normalizeAnalyticsPlatform(process.platform),
            architecture: normalizeAnalyticsArchitecture(process.arch)
        })
        if (!accepted) this.rendererRateWindowCount = Math.max(0, this.rendererRateWindowCount - 1)
        return accepted
    }

    async flush(timeoutMs = 1_500): Promise<void> {
        await Promise.race([
            this.client.flush({ maxAttempts: 1 }).catch(() => false),
            new Promise((resolve) => {
                const timer = setTimeout(resolve, Math.max(50, Math.min(10_000, timeoutMs)))
                timer.unref?.()
            })
        ])
    }

    async shutdown(timeoutMs = 1_500): Promise<void> {
        if (this.statusRefreshTimer) clearInterval(this.statusRefreshTimer)
        this.statusRefreshTimer = null
        this.statusListeners.clear()
        await this.client.shutdown({ timeoutMs })
    }

    private publishStatus(status: AnalyticsStatus): void {
        const signature = JSON.stringify(status)
        if (signature === this.lastPublishedStatus) return
        this.lastPublishedStatus = signature
        for (const listener of this.statusListeners) {
            try {
                listener(status)
            } catch {
                // Analytics status delivery cannot change a persisted consent result.
            }
        }
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

