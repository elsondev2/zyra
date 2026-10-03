# Model catalog presentation

## Source and scope

Zyra owns model discovery and the runtime under `src/runtime/`. `src/openai-model-catalog.mjs` fetches account-visible models directly from OpenAI and ChatGPT endpoints. Endpoint results replace the catalog, including an empty result, so retired models are removed. A provider outage retains the last valid account-specific cache. `listAvailableModels` projects provider-qualified IDs, labels, supported reasoning efforts, input modes, and context windows into Desktop and Browser.

Desktop refreshes the catalog in the background with a 15-minute freshness window and supports a manual refresh. `models.updated` reaches the shared store and settings caches. New endpoint IDs are registered with the owned transport without waiting for a package release. Configured non-OpenAI providers retain their own metadata and availability checks; adding a custom entry does not verify account access.

## Ordering and the Latest badge

`src/model-order.mjs` is the shared presentation policy used by the runtime model list, fleet catalog, and Desktop/Browser composer. Its declaration file keeps renderer imports typed without maintaining a second implementation.

- Runtime entries use separate `provider` and `id` fields; UI entries use `provider/id`. Both forms receive the same order.
- GPT versions compare numerically, including future major, minor, and patch versions. Display labels are never parsed as release metadata.
- Existing documented GPT-5.6 tier preferences remain tie-breakers within that version. They do not pin the latest release. Other versions put full-size variants ahead of mini/spark variants, keeping catalog order for remaining ties.
- Identical model IDs prefer the existing `openai-codex` route over `openai`.
- The composer badges the highest versioned GPT entry in its supplied list. This is a catalog-relative label, not a claim about global release chronology, account entitlement, or model quality.
- Unknown model families keep their catalog order and receive no speculative Latest badge. Supporting another version convention requires an explicit parser and tests, not a label substring check.
- Search filters results without reassigning the badge to an older visible result.
- The UI never inserts a fixed “latest” model missing from its input. The existing selected-model fallback while the catalog is unavailable is retained.
- Catalog changes affect presentation only. They do not switch an established Chat's selected model or rewrite defaults.

Desktop and the local Browser application use the same composer implementation. Keep its badge and ordering logic free of release-specific model IDs.

## Regression checks

```bash
node scripts/test-model-order.mjs
cd desktop
bun scripts/test-assistant-model-catalog.tsx
bun scripts/test-assistant-startup-connection.ts
```

The ordering suite runs in the quick/core gates. The composer suite runs in the Desktop gate and covers the real hooks and rendered picker rows in both composer layouts. Fixtures include an illustrative future release to prevent a new hardcoded “latest” model from passing unnoticed.
