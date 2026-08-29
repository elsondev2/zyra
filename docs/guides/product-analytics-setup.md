# Configure product analytics

Zyra product analytics is off by default. It stays inert until all three conditions are true:

1. analytics is explicitly enabled;
2. a valid PostHog project capture key is present;
3. an approved HTTPS PostHog host is present.

Use a PostHog project capture key with the `phc_` prefix. Zyra rejects `phx_` personal API keys and does not need one. The official release bundles Zyra's public project token and US ingestion host in main/CLI code. Renderer and Browser pages never receive them.

Source checkouts do not use the bundled release destination. Packaged Desktop builds and standalone distributions activate it only after the user opts in. Set `ZYRA_ANALYTICS_USE_RELEASE_CONFIG=0` to disable the bundled destination or `ZYRA_ANALYTICS_ENABLED=false` as the operator kill switch.

## Environment configuration

Use environment values to override the bundled destination for staging, local testing, or a regional migration:

```text
ZYRA_POSTHOG_PROJECT_KEY=<POSTHOG_PROJECT_KEY>
ZYRA_POSTHOG_HOST=https://us.i.posthog.com
```

For the EU region, use `https://eu.i.posthog.com`.

A self-hosted origin also needs an exact hostname allowlist:

```text
ZYRA_POSTHOG_HOST=https://analytics.example.net
ZYRA_POSTHOG_ALLOWED_HOSTS=analytics.example.net
```

The allowlist contains hostnames only. Do not include a protocol, path, port, credentials, query string, or fragment.

Production Desktop/CLI clients require the shared user preference even if `ZYRA_ANALYTICS_ENABLED=true` is present, so release configuration cannot bypass consent. `ZYRA_ANALYTICS_ENABLED=false` remains an operator kill switch and makes the setting environment-managed.

## Persisted configuration

Desktop main reads its config from the app user-data directory:

```text
<ZYRA_DESKTOP_USER_DATA>/analytics/config.json
```

The standalone CLI reads:

```text
<ZYRA_STATE_DIR or ~/.zyra>/analytics/config.json
```

The product-wide consent choice is stored separately:

```text
<ZYRA_STATE_DIR or ~/.zyra>/analytics/consent.json
```

Example local destination configuration with placeholders:

```json
{
  "schemaVersion": 1,
  "projectKey": "<POSTHOG_PROJECT_KEY>",
  "host": "https://us.i.posthog.com"
}
```

For self-hosted PostHog:

```json
{
  "schemaVersion": 1,
  "projectKey": "<POSTHOG_PROJECT_KEY>",
  "host": "https://analytics.example.net",
  "allowedHosts": ["analytics.example.net"]
}
```

The onboarding welcome records an explicit Share diagnostics and usage or No thanks decision, and the final review lets the user confirm or change it. Desktop Settings > General > Privacy and `/analytics on|off` update the same product-wide preference. Main preserves existing project and host values. If the user opts in before a valid project key and host exist, Zyra saves only preference files and shows "Needs setup"; it creates no installation identity, event queue, or network work. Adding the release configuration later activates that saved preference. Turning analytics off cancels the current transport, removes queued events, and makes other Desktop/CLI/TUI clients stop before another capture or retry. A random installation UUID remains only after analytics was previously active, preserving stable re-opt-in without using device or account identity. The renderer receives a redacted status and never receives the key, capture URL, custom hostname, or UUID.

## PostHog project settings

Before production use:

- disable IP address capture in PostHog organization and project privacy settings;
- set event retention to the intent documented in the [event catalog](../architecture/product-analytics.md#event-catalog);
- keep session replay, autocapture, heatmaps, DOM capture, and remote feature flags off for Zyra;
- restrict access to the PostHog project;
- do not add person or account enrichment to the random installation identifier;
- do not create ingestion transformations that recover URLs, paths, prompts, or account identity.

## Confirm the boundary

```bash
npm run test:analytics
npm run privacy-check
```

The analytics test uses a fake transport. It does not require credentials and does not contact PostHog.
