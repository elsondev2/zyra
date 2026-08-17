# Desktop performance baseline and resource budget

Status: Active engineering baseline

Measured: 2026-08-17
Branch: `dev`

## User-visible targets

These are Zyra project budgets for a Windows production-renderer launch with an aged local profile. They are not universal Electron guarantees.

| Path | Budget |
| --- | ---: |
| Cold launch to useful chat surface | median ≤ 5 s; p95 ≤ 7 s |
| Existing long-chat open to bounded local timeline | median ≤ 600 ms; p95 ≤ 900 ms |
| Settled working set, no integrated Browser tab | 550–700 MiB including Electron, GPU/network services, and the narrow agent server |
| Settled CPU after background reconciliation | ≤ 10% of one CPU core; GPU process ≤ 1% |
| Main-process private memory | ≤ 225 MiB |
| Renderer private memory | ≤ 225 MiB |

An active integrated Browser tab, Monaco editor, Mermaid diagram, terminal, Voice session, or large file preview has its own incremental budget and must remain lazy or suspendable.

## Measurement environment

- Windows 11 Pro build 26200
- Intel Core i5-10310U, 4 cores / 8 logical processors
- 15.78 GiB RAM, SSD, Intel UHD Graphics
- Electron 43.4.0 / Node 24.18.1
- React 19.2, Vite 5.4
- Aged `Zyra-dev` profile: 105 sessions, 106 threads, and a 273 MiB Assistant database
- Production renderer assets launched through Electron against the dev profile
- Detached agent-server memory is included in optimized process totals
- Background machine load was high; paired phase traces and persistence A/B results are stronger evidence than single cold-launch samples

Raw local benchmark output lives under ignored `tmp/perf-20260817/` and must not be published because it is derived from a private local profile.

## Before and after

### End-to-end aged-profile workload

| Metric | Before | Optimized | Change |
| --- | ---: | ---: | ---: |
| Cold useful chat surface | 20.82 s | 4.99 s median | 76.0% faster |
| Heaviest chat open | 5.60 s | 0.38 s median | 93.2% faster |
| Settled working set | 1,293 MiB | 655 MiB median | 49.3% lower |
| Settled CPU after a 60-second reconciliation window | short baseline remained multi-core busy | 0.06% of one core | inside budget |
| Settled private memory | not available from the original short sample | 472 MiB median | inside budget |

The heaviest measured thread exposed 12,300 historical records while returning only the newest bounded page (7 messages and 27 activities). Final frozen-build verification produced a 4.18 s warm-files useful surface, 315 ms chat detail, 643 MiB working set, 465 MiB private memory, and 0.74% of one core after settling. One fresh-build/host-contention outlier reached 8.87 s, so p95 cold-launch work remains open even though the measured median is inside budget.

### Paired startup phase trace

| Main-process phase | Before | Optimized | Change |
| --- | ---: | ---: | ---: |
| Assistant initialization | 22.07 s | 2.53 s | 88.5% faster |
| Persistence load | 5.83 s | 0.83 s | 85.8% faster |
| Canonical catalog import | 15.64 s | 1.16 s | 92.6% faster |
| Debounced persistence flush | 3.14 s | 0.017 s | 99.5% faster |

### Exact persistence A/B on the optimized code

| Metric | Forced SQL.js | Native SQLite | Change |
| --- | ---: | ---: | ---: |
| Settled working set | 1,565 MiB | 682 MiB median | 56.5% lower |
| Settled private memory | 1,380 MiB | 497 MiB median | 64.0% lower |
| Long-chat detail | 2.90 s | 1.94 s median before local-first ordering | 32.9% faster |
| Useful surface | 5.30 s | 4.69 s median | 11.6% faster |

## Material changes

1. The agent-server catalog and chat index now import a narrow project-path module instead of the 2,200-line Zyra runtime. A direct cold import fell from roughly 9.0 s for `zyra-sdk.mjs` to 50–73 ms for the narrow catalog/index modules.
2. Startup no longer exports and atomically rewrites the entire 273 MiB SQL.js database before Assistant bootstrap can return.
3. Electron production persistence uses Node 24's disk-backed SQLite connection in WAL mode. SQL.js remains the deterministic test backend outside Electron.
4. Compact JSON recovery snapshots are generated from the in-memory shell rather than rescanning every persisted history row.
5. Model discovery no longer prewarms automatically during startup. It runs only when a caller actually needs models.
6. Chat detail returns the bounded persisted page first; canonical reconciliation continues in the background with duplicate-load suppression.
7. Session/thread selection no longer waits for remote presence refresh.
8. The local Browser bridge binds Assistant on its first protected request instead of constructing Assistant before the Desktop window exists.
9. Canonical history reconciliation uses persisted canonical modified-time/entry-count revisions plus generation-safe invalidation; current chats no longer rescan on every launch and an in-flight refresh cannot erase a newer change.
10. Failed persistence batches remain queued, shutdown waits for SQLite close, and a failed final commit keeps Zyra running instead of discarding state. Recovery preserves the database, WAL, and shared-memory files as one set.
11. Incremental JSONL indexing retains incomplete tails and fully rescans same-size rewrites.
12. The Review inspector and its large diff bundle remain lazy until opened; an unused Poppins request was removed.

## Profile growth still to address

The aged dev profile occupies about 1.55 GiB:

| Area | Size |
| --- | ---: |
| Chromium session data | 1,095.5 MiB |
| Default HTTP cache | 359.7 MiB |
| Code cache | 272.6 MiB |
| Browser partitions | 455.5 MiB |
| Assistant directory | 439.6 MiB |

Two unreachable legacy Browser partition directories account for roughly 243 MiB. They are safe candidates for an explicit, confirmed cleanup action; Zyra must not silently remove Browser identity or storage. Cache cleanup and inactive Browser-tab suspension are the next bounded resource projects.

## Correctness boundaries

- Native SQLite opens the existing database directly and adds only nullable canonical-revision columns; no history payload rewrite or destructive compaction is performed.
- A private pre-change database backup was taken for the local verification run.
- Canonical history remains authoritative and converges after local-first rendering. Explicit canonical modified-time and entry-count revisions prevent every-launch rescans and preserve invalidations that arrive during an in-flight refresh.
- The compact JSON file is metadata recovery only; SQLite/WAL is the canonical source for local-only history.
- Full authoritative row ownership for a hard canonical transcript rollback/truncation remains a follow-up. Zyra detects the revision change, but must not delete unmatched local rows until canonical ownership is persisted per row.
- Voice, Browser, Agent Inbox, onboarding, permissions, and persistence contracts remain unchanged.
- No paid provider generation, reset redemption, credential reset, or public release action is part of this benchmark.
