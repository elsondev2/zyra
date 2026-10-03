# Model pricing

Zyra owns OpenAI price discovery and token-cost calculation here. The model
endpoint determines availability; the public OpenAI pricing tables determine
rates. Neither source replaces the other.

- `parser.mjs` reads the official Markdown text-token tables.
- `snapshot.mjs` is the published offline baseline, including standard, batch,
  flex, fast and ultrafast rates where documented.
- `refresh.mjs` maintains a six-hour local cache; forced model-catalog refresh
  also refreshes prices. Failed or malformed responses retain the last valid
  snapshot. Offline/cache-only reads make no network requests. Public price
  requests never contain account credentials.
- `index.mjs` calculates per-response costs, including cache reads/writes and
  documented long-context rates. It accepts both cache-inclusive API input
  totals and Zyra's separate input/cache counts. Reasoning is included in output.
- `message-cost.mjs` repairs old unversioned OpenAI estimates when reading usage.
  New responses persist their estimate, pricing timestamp and actual service
  tier, so later rate changes do not rewrite historical estimates.

Completion snapshots include the pending response because engine listeners fire
before persistence. TUI attachment accepts the server's numeric cumulative total
even when only a page of history is loaded. Desktop turns retain response counts;
their already-summed costs are used instead of applying a long-context threshold
to the aggregate of several short requests.

Provider transports, desktop usage, the TUI and mobile use these functions.
Mobile's existing Claude fallback remains separate and does not guess cache-write
duration. Undocumented models, cache categories or tiers are unpriced, not free.
API-equivalent values are estimates, not subscription invoices or billed spend.

Derived desktop/mobile numeric usage caches use version 3 to rebuild earlier
unversioned costs from their original logs. Canonical messages and original logs
are preserved. Legacy records without service-tier metadata use standard API
estimates; their actual historical tier cannot be recovered from token counts.

Run `bun run test:model-pricing` for refresh/cache, category/tier and surface
parity checks. The provider transport test uses synthetic SSE responses.
