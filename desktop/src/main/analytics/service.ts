import { join } from 'node:path'
import { app } from 'electron'
import {
    createProductAnalytics,
    normalizeAnalyticsArchitecture,
    normalizeAnalyticsPlatform,
    type AnalyticsStatus,
    type ProductAnalyticsClient
} from '../../../../src/analytics/client.mjs'
import type { AnalyticsEventInput, AnalyticsEventName } from '../../shared/analytics/contracts'

const MAX_RENDERER_EVENT_BYTES = 8 * 1024
const RENDERER_ANALYTICS_EVENTS = new Set(['zyra_v1_files', 'zyra_v1_workspace_ui'])

export class DesktopAnalyticsService {
    private readonly client: ProductAnalyticsClient
    private rendererRateWindowStartedAt = 0
    private rendererRateWindowCount = 0

    constructor(userDataPath: string, options: {
        client?: ProductAnalyticsClient
        env?: Record<string, string | undefined>
    } = {}) {
        this.client = options.client || createProductAnalytics({
            storageDirectory: join(userDataPath, 'analytics'),
            source: 'desktop_main',
            appVersion: app.getVersion(),
            platform: process.platform,
            architecture: process.arch,
            env: options.env || process.env
        })
    }

    initialize(): Promise<void> {
        return this.client.initialize()
    }

    status(): AnalyticsStatus {
        return this.client.status()
    }

    updateEnabled(enabled: boolean): Promise<AnalyticsStatus> {
        return this.client.updateEnabled(enabled)
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
        if (!this.client.status().enabled) return false
        const now = Date.now()
        if (now - this.rendererRateWindowStartedAt >= 60_000) {
            this.rendererRateWindowStartedAt = now
            this.rendererRateWindowCount = 0
        }
        if (this.rendererRateWindowCount >= 120) return false
        this.rendererRateWindowCount += 1
        return this.client.capture(input.event, {
            ...input.properties,
            schema_version: 1,
            source: 'desktop_renderer',
            app_version: app.getVersion(),
            platform: normalizeAnalyticsPlatform(process.platform),
            architecture: normalizeAnalyticsArchitecture(process.arch)
        })
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

    shutdown(timeoutMs = 1_500): Promise<void> {
        return this.client.shutdown({ timeoutMs })
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

