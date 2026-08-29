# Product analytics security and privacy

**Status:** Current

## Threat model

Analytics accepts signals from trusted local product code but treats every event payload as untrusted. A compromised renderer must not exfiltrate application content through analytics, select a destination, obtain project configuration, create an unbounded queue, or keep shutdown open.

The main risks are content smuggling through arbitrary properties, credential exposure to Browser pages, endpoint redirection, stable identity derived from personal data, retry amplification, and accidental capture through third-party browser instrumentation.

## Controls

- The onboarding welcome requires an explicit analytics choice, the final review can change it, and Desktop Settings or `/analytics off` withdraws the shared Desktop/CLI/TUI preference.
- One checked-in catalog allowlists event names, property names, enums, bounds, and error codes.
- Main sanitizes renderer events after trusted IPC. Unknown fields disappear.
- The preload exposes analytics only to trusted Zyra shell renderers. Managed web pages have no preload. Browser popups use a reduced preload without analytics. Remote Browser clients do not receive the adapter.
- Main returns redacted status only. Project keys, capture URLs, and configured hostnames never cross to renderers.
- Endpoint validation requires HTTPS, an approved hostname, root path, and no URL credentials, query, or fragment.
- A random UUID identifies one installation. Account, OAuth, email, username, device name, path, and project data do not contribute. Capture events set `$process_person_profile` to `false`; the PostHog project must also disable IP capture.
- Queue count, file size, local event age, batch, timeout, retry, and shutdown bounds prevent resource amplification and indefinite offline retention.
- Concurrent CLI/TUI writers share one exclusively created random identity. A short-lived file lock protects read-modify-write queue updates, and expiring batch claims prevent duplicate concurrent sends.
- The capture client uses `credentials: omit`, `referrerPolicy: no-referrer`, and rejects redirects.
- No PostHog browser SDK is present. Autocapture, replay, heatmaps, DOM capture, and feature flags are absent.
- Analytics failures are swallowed at the product boundary and never replace product errors or raw diagnostics.

## Content prohibition

Never add properties for prompts, responses, transcripts, reasoning, file content, paths, project or repository names, URLs, Browser history, cookies, credentials, clipboard data, media, terminal content, command arguments, command output, raw exception messages, stack traces, account identifiers, or email.

A new event or property requires:

1. a catalog change;
2. a documented owner, trigger, privacy class, and retention intent;
3. deterministic sanitizer and representative-event tests;
4. a review of renderer, remote-page, logs, sessions, and queue persistence;
5. measured frequency and queue impact.

Opt-out writes the shared preference, deletes the current client's queue, cancels its timer and transport, and causes sibling clients to delete their queues before another capture or retry. A transport request already accepted by the network stack may finish while opt-out is being written. Saving consent before release configuration creates only preference files, with no installation UUID or event queue. After analytics has been active, the random installation UUID remains for stable re-opt-in and contains no device or account derivation.

## Incident response

If private data is found in an analytics event:

1. disable ingestion with `ZYRA_ANALYTICS_ENABLED=false` or the Desktop toggle;
2. remove or reject the event at the catalog boundary;
3. identify affected event versions and time range without copying private payloads into an issue;
4. delete affected PostHog data under the project retention and deletion controls;
5. rotate the project key if destination integrity is uncertain;
6. add a regression fixture using synthetic data;
7. document the correction and retention action.

Do not log the offending payload while investigating it.
