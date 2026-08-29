export type BundledReleaseAnalyticsConfig = {
    readonly projectToken: string
    readonly host: string
}

export const BUNDLED_RELEASE_ANALYTICS_CONFIG: BundledReleaseAnalyticsConfig
export function withBundledReleaseAnalyticsConfig(
    env?: Record<string, string | undefined>,
    enabled?: boolean
): Record<string, string | undefined>
