# Product analytics

**Status:** Current

Zyra has an optional PostHog capture integration for coarse product outcomes. The onboarding welcome requires an explicit Share diagnostics and usage or No thanks decision, and the final review lets the user confirm or change it. Capture stays disabled unless the user enables analytics and the build supplies both a valid project key and an approved HTTPS host. A saved preference may create the bounded analytics config file, but inactive analytics does not create an installation identifier, queue events, or make network requests.

## Ownership and process boundaries

The versioned catalog lives at [`analytics/events.v1.json`](../../analytics/events.v1.json). The CLI and Desktop use the same catalog and sanitizer.

Desktop main owns configuration, installation identity, queue persistence, batching, retries, and capture requests. Packaged Desktop and standalone distributions may load the checked-in public `phc_` project token and approved ingestion host from `src/analytics/release-config.mjs`; source checkouts leave that destination inactive by default. The Electron preload exposes a narrow `zyraAnalytics` adapter only to trusted Zyra renderers. Browser popup pages have no analytics adapter. Remote Browser clients do not receive this API through the DevScope relay.

Renderer events cross trusted IPC as an event name and bounded properties. Main accepts only the two renderer-owned catalog events, caps renderer submissions at 120 per minute, and applies the catalog owner and property sanitizer again before queueing. A renderer cannot forge main/CLI events, add arbitrary properties, or override the PostHog destination, project key, installation identity, retry policy, or retention settings.

The CLI owns a separate client instance and queue under its local state directory. Desktop, CLI, and TUI share the explicit consent file at `<ZYRA_STATE_DIR or ~/.zyra>/analytics/consent.json`, so Desktop onboarding, Desktop Settings, and `/analytics on|off` control one product-wide choice. Each client re-reads that choice before capture and every retry. CLI instrumentation records durable command and skill names without arguments, prompt bodies, command bodies, or output.

## Runtime contract

- Queue limit: 200 events by default.
- Local queue age: 7 days by default, independently bounded between 1 second and 30 days. Expired rows are removed during hydration and before every flush.
- Batch limit: 20 events by default.
- Flush interval: 10 seconds while enabled and nonempty.
- Inactive shared-preference refresh: at most once per second during capture, with an immediate refresh when status is requested.
- Capture timeout: 3 seconds.
- Retry delays: 250 ms, 1 second, and 4 seconds. A failed batch remains on disk.
- Shutdown flush: one best-effort attempt bounded by the caller. Desktop uses 1.5 seconds; CLI uses 750 ms.
- Capture endpoint: `/batch/` on a validated HTTPS origin.
- PostHog payload: the project key appears only as top-level `api_key`; each event carries the random UUID as `properties.distinct_id` and sets `$process_person_profile` to `false`.
- Identity: a random UUID stored beside the analytics queue. Exclusive creation and re-read ensure concurrent CLI/TUI processes use one value. It is not derived from account data, OS username, project data, or filesystem identity.
- Concurrent writers: queue updates use a short-lived exclusive lock plus atomic fsynced replacement. Flushers claim bounded batches so two CLI/TUI processes do not send or remove the same row.

Analytics initialization runs asynchronously and never gates Desktop or CLI readiness. Capture failures never fail Chat, Voice, Browser, Files, terminal, update, or shutdown work.

Opting out during onboarding, Settings, or `/analytics off` cancels the current client's timer and transport, removes its queue, and writes the shared product preference before other clients may capture or retry. Other running clients re-read the preference before their next capture and each retry, then remove their own queues. A network request already accepted by the capture transport may finish while opt-out is being written; no later capture or retry is allowed. Choosing No thanks on first run starts from an empty queue, so there is no pre-consent request to finish. The random installation UUID intentionally remains after a previously active installation opts out so a later re-opt-in uses the same pseudonymous installation instead of creating identity churn. The UUID contains no derived device, account, username, path, or project value and is never sent while analytics is off.

## Endpoint policy

Zyra accepts the official US and EU PostHog capture hosts. A self-hosted HTTPS hostname requires an explicit `ZYRA_POSTHOG_ALLOWED_HOSTS` entry or a matching `allowedHosts` value in the main-owned config. The validator rejects HTTP, localhost, credentials in URLs, query strings, fragments, non-root paths, and unlisted hosts.

The client supports project capture keys. It has no personal API key setting and does not call PostHog administration, query, export, feature-flag, or session-replay APIs.

## Data excluded

Incognito Browser tabs emit no analytics. Main-owned session checks suppress tab, navigation, transfer, popup, download, permission, threat, history, ad-block, utility-window, and error captures for incognito sessions.

The catalog cannot represent prompts, responses, transcripts, reasoning, file contents, file paths, repository or project names, URLs or query strings, Browser history, cookies, passwords, OAuth values, clipboard data, images, audio, terminal text, command arguments, command output, raw errors, email addresses, or account identifiers.

The sanitizer accepts only coarse enums, booleans, bounded integers, semantic app versions, safe skill names, and allowlisted error codes. PostHog project and organization privacy settings must disable IP address capture because the capture service receives the network connection even though Zyra sends no IP property. Unknown event names and properties are dropped. Zyra does not enable PostHog autocapture, session replay, heatmaps, DOM capture, or remote feature flags.

## Event catalog

Every event includes `schema_version`, `source`, `app_version`, `platform`, and `architecture`. The table lists additional properties.

| Event | Owner | Trigger | Additional properties | Privacy | Retention intent |
| --- | --- | --- | --- | --- | --- |
| `zyra_v1_app_lifecycle` | Desktop main | Launch readiness, warm activation, shutdown, process loss, bounded hang diagnostics, or update check outcome | `action`, `outcome`, `launch_bucket`, `process_kind`, `duration_ms`, `error_code` | Operational | 90 days |
| `zyra_v1_onboarding` | Desktop main | A setup step, completion, navigation, abandonment, or review action settles | `action`, `step`, `outcome`, `error_code` | Product usage | 90 days |
| `zyra_v1_account_connection` | Desktop main | Connect, replace, retry, or disconnect settles | `action`, `method`, `outcome`, `error_code` | Product usage | 90 days |
| `zyra_v1_chat` | Desktop main | Chat create, send, cancel, completion, failure, recovery, or context compaction | `action`, `outcome`, `model_family`, `effort`, `runtime_mode`, `duration_ms`, `attachment_count`, `error_code` | Product usage | 90 days |
| `zyra_v1_voice` | Desktop main | Voice start, connection, first response, interruption, stop, failure, or duplicate prevention | `action`, `outcome`, `mode`, `duration_ms`, `error_code` | Product usage | 30 days |
| `zyra_v1_project` | Desktop main | Project attach or open settles | `action`, `outcome`, `has_git`, `language_count`, `package_manager_count`, `error_code` | Product usage | 90 days |
| `zyra_v1_files` | Desktop renderer | Files mode, preview, edit, save, discard, settled search, full-screen, tree reveal, or bounded timing | `action`, `outcome`, `preview_kind`, `size_bucket`, `duration_ms`, `result_count`, `enabled`, `error_code` | Product usage | 90 days |
| `zyra_v1_browser` | Desktop main | Tab/new-tab, coarse navigation, popup, download, history import, ad block, threat, permission, or transfer outcome | `action`, `outcome`, `destination`, `transfer_target`, `item_count`, `duration_ms`, `error_code` | Security and product usage | 30 days |
| `zyra_v1_utility_window` | Desktop main | Utility tab create, drag, tear-off, merge, close, or terminal transfer | `action`, `outcome`, `tab_kind`, `tab_count`, `error_code` | Product usage | 90 days |
| `zyra_v1_workspace_ui` | Desktop renderer | Agent Inbox disclosure, workspace selection, Settings section, theme mode, or accessibility toggle | `action`, `section`, `workspace`, `theme_mode`, `enabled` | Product usage | 90 days |
| `zyra_v1_cli` | CLI/TUI | Startup, durable slash command, safe skill name, Desktop workspace outcome, or reconnect recovery | `action`, `command`, `skill`, `outcome`, `session_mode`, `runtime`, `error_code` | Product usage | 90 days |

Local queue age and PostHog retention are separate. Zyra removes unsent local events after 7 days by default. PostHog retention is a project administration setting; the client records the intended server limit but cannot enforce server-side deletion. The project owner must configure matching retention before production use.

## Production capture map

| Surface | Main capture locations |
| --- | --- |
| App lifecycle and updates | `desktop/src/main/index.ts`, `desktop/src/main/update/manager.ts` |
| Onboarding and OpenAI connections | `desktop/src/main/ipc/handlers/setup-handlers.ts` |
| Chat, Voice, project attachment | `desktop/src/main/assistant/service.ts` |
| Project opening | Explicit navigation in `desktop/src/renderer/src/pages/folder-browse/useFolderBrowseActions.ts`, trusted IPC in `desktop/src/main/ipc/handlers/project-details-handlers.ts`, then capability-only capture in `desktop/src/main/index.ts` |
| Files and previews | `desktop/src/renderer/src/pages/assistant/AssistantFilesWorkspace.tsx` and `desktop/src/renderer/src/components/ui/file-preview/` hooks |
| Browser tabs, navigation, popup, download, permissions, imports, blocking, threats, transfer | `desktop/src/main/browser-view-manager.ts`, `browser-popup-manager.ts`, `browser-download-service.ts`, and `ipc/handlers/browser-preview-handlers.ts` |
| Utility windows and Terminal transfer | `desktop/src/main/assistant/assistant-utility-window-manager.ts` |
| Workspace and Settings usage | `desktop/src/renderer/src/pages/assistant/AssistantDiffPanel.tsx`, `pages/settings/SettingsShell.tsx`, and `lib/settings.tsx` |
| CLI/TUI startup, commands, skills, workspace routing, recovery | `src/zyra-app.mjs`, `src/slash-command-handlers.mjs`, and `src/agent-server/tui-runtime.mjs` |

All 66 catalog action values have a production capture path. The deliberate limits are:

- events before the first explicit consent choice are discarded, including the initial display of the Welcome step;
- clean shutdown has a bounded `started` signal because an after-exit confirmation cannot be delivered reliably;
- PostHog receives the network connection, so project-side IP capture must remain disabled;
- server-side retention and access controls remain PostHog administrator responsibilities;
- analytics remains inert until a public `phc_` capture key and approved host are supplied.

## Validation

```bash
npm run test:analytics
npm run benchmark:analytics
npm run privacy-check
npm run ui:typecheck
npm run ui:build
npm audit --omit=dev --audit-level=low
npm audit --omit=dev --audit-level=low --prefix desktop
```

Tests use an injected local fake transport. They verify disabled behavior, configuration and endpoint validation, renderer and remote-page boundaries, sanitation, batching, retry bounds, shutdown flush, queue persistence, pseudonymous identity, representative catalog events, and source-level credential exclusion. No test sends a PostHog request.

## Measured overhead

Measured on the Windows release workstation with Node 22.22.0 and 100 synthetic allowlisted events:

| Mode | Initialization | Capture 100 | Flush | Heap delta | Max event-loop delay | Requests | Payload bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Disabled | 4.96 ms | 1.93 ms | 0.19 ms | 58,376 B | 0 ms observed | 0 | 0 |
| Fake transport enabled | 49.03 ms | 2,381.34 ms | 242.79 ms | 318,784 B | 18.64 ms | 5 | 36,845 B |

The enabled capture figure is a sequential durability stress test that fsyncs the bounded queue after every accepted event. Product callers do not await capture I/O. Disabled analytics performed no write or network work. Heap and timing measurements vary by machine and must be treated as observations rather than stable budgets.
