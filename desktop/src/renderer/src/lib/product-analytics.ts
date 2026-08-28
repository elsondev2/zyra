import type {
    AnalyticsEventInput,
    AnalyticsEventName,
    AnalyticsStatus
} from '@shared/analytics/contracts'
import { isElectronRendererRuntime } from './browser-file-url'

const recentEventKeys = new Map<string, number>()
const MAX_RECENT_EVENT_KEYS = 64

export function canUseDesktopAnalytics(): boolean {
    return isElectronRendererRuntime() && Boolean(window.zyraAnalytics)
}

export async function getDesktopAnalyticsStatus(): Promise<AnalyticsStatus | null> {
    if (!canUseDesktopAnalytics()) return null
    const result = await window.zyraAnalytics!.getStatus()
    return result.success ? result.status : null
}

export async function setDesktopAnalyticsEnabled(enabled: boolean): Promise<AnalyticsStatus | null> {
    if (!canUseDesktopAnalytics()) return null
    const result = await window.zyraAnalytics!.setEnabled(enabled)
    return result.success ? result.status : null
}

export function captureProductEvent<Name extends AnalyticsEventName>(input: AnalyticsEventInput<Name>): void {
    if (!canUseDesktopAnalytics()) return
    void window.zyraAnalytics!.capture(input).catch(() => undefined)
}

export function captureProductEventOnce<Name extends AnalyticsEventName>(
    key: string,
    input: AnalyticsEventInput<Name>,
    windowMs = 1_000
): void {
    const now = Date.now()
    const previous = recentEventKeys.get(key) || 0
    if (now - previous < windowMs) return
    recentEventKeys.delete(key)
    recentEventKeys.set(key, now)
    while (recentEventKeys.size > MAX_RECENT_EVENT_KEYS) {
        const oldest = recentEventKeys.keys().next().value
        if (typeof oldest !== 'string') break
        recentEventKeys.delete(oldest)
    }
    captureProductEvent(input)
}
