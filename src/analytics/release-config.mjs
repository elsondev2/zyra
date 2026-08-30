// PostHog project capture tokens are public write-only identifiers; no read or admin credential ships.
export const BUNDLED_RELEASE_ANALYTICS_CONFIG = Object.freeze({
  projectToken: "phc_zrkd7JqXfs6LVvWFV54Z4wPq4JA2qGpYrpUNdUJRmymk",
  host: "https://us.i.posthog.com",
});

export function withBundledReleaseAnalyticsConfig(env = {}, enabled = true) {
  if (!enabled) return env;
  return {
    ...env,
    ZYRA_POSTHOG_PROJECT_KEY: String(env.ZYRA_POSTHOG_PROJECT_KEY || "").trim() || BUNDLED_RELEASE_ANALYTICS_CONFIG.projectToken,
    ZYRA_POSTHOG_HOST: String(env.ZYRA_POSTHOG_HOST || "").trim() || BUNDLED_RELEASE_ANALYTICS_CONFIG.host,
  };
}
