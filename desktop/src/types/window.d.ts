import type { DevScopeApi } from '../shared/contracts/devscope-api'
import type { DesktopAnalyticsApi } from '../shared/analytics/contracts'

declare global {
    interface Window {
        devscope: DevScopeApi
        zyraAnalytics?: DesktopAnalyticsApi
    }
}

export {}
