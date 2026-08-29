# Configure product analytics

Zyra product analytics is off by default. It stays inert until all three conditions are true:

1. analytics is explicitly enabled;
2. a valid PostHog project capture key is present;
3. an approved HTTPS PostHog host is present.

Use a PostHog project capture key with the `phc_` prefix. Zyra rejects `phx_` personal API keys and does not need one.

## Environment configuration

Set placeholders through your normal private environment management:

```text
ZYRA_ANALYTICS_ENABLED=true
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

An environment value for `ZYRA_ANALYTICS_ENABLED` overrides the persisted toggle. Desktop Settings then shows that the environment manages the setting.

## Persisted configuration

Desktop main reads its config from the app user-data directory:

```text
<ZYRA_DESKTOP_USER_DATA>/analytics/config.json
```

The standalone CLI reads:

```text
<ZYRA_STATE_DIR or ~/.zyra>/analytics/config.json
```

Example with placeholders:

```json
{
  "schemaVersion": 1,
  "enabled": true,
  "projectKey": "<POSTHOG_PROJECT_KEY>",
  "host": "https://us.i.posthog.com"
}
```

For self-hosted PostHog:

```json
{
  "schemaVersion": 1,
  "enabled": true,
  "projectKey": "<POSTHOG_PROJECT_KEY>",
  "host": "https://analytics.example.net",
  "allowedHosts": ["analytics.example.net"]
}
```

Desktop Settings > General > Privacy changes only `enabled`. Main preserves existing project and host values. If no valid project key and host exist yet, attempting to enable shows "Needs setup" without creating analytics state; add the private configuration first, then enable it. Turning analytics off immediately cancels timers and removes queued events. The random installation UUID remains for stable re-opt-in; it is randomly generated and contains no device or account identity. The renderer receives a redacted status and never receives the key, capture URL, custom hostname, or UUID.

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
