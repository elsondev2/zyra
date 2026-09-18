# Visualization scrolling

## Changes

- The existing, version-pinned LegendList 3.3.5 web patch now uses `Element.moveBefore` to reorder connected containers. Unlike remove/reinsert operations, this preserves an iframe's document, focus and native disclosure state. Both CommonJS and ESM bundles are patched through the existing Desktop postinstall command. Engines without the API retain the original insertion fallback.
- The document builder reuses immutable sanitized HTML across virtual-row remounts, theme updates and exports. Its LRU cache holds at most 48 entries and 2 MiB of estimated UTF-16 key/value payload, plus small Map/object overhead. It retains no iframe nodes or extra mounted rows. Title, theme, CSP and inline/export styles are assembled separately on every request. Changed HTML gets a new cache entry; evicted HTML is sanitized again.
- The preparation state reserves the final preview height. The title row also reserves its control height. A newly mounted preview no longer briefly presents a text-height row before becoming a full-height chart.

No screenshot substitutes, reduced SVG precision, lower-resolution assets, disabled controls or relaxed sandbox permissions were introduced.

## Reproduction

```sh
npm --prefix desktop run test:visualization-scroll
npm --prefix desktop run benchmark:visualization-scroll
```

An optional absolute JSON output path can follow the benchmark command. `test:visualization-scroll` also verifies both dependency bundles' ordering and older-engine fallback, rejects same-frame reloads during the measured scroll/update phases, and checks bounded caching and zero repeated sanitization on the final warm scroll pass.

The fixture uses the real `AssistantVirtualTimeline`, LegendList, visualization components, DOMPurify and app CSP. It renders 20 synthetic messages with two 80-bar SVG charts each, waits for the bottom previews to load, applies six append/remove prompt pairs, then performs three 64-frame back-and-forth scroll passes. It records iframe loads separately from reloads of the same iframe element. It also checks source invalidation and the empty iframe sandbox.

## Local results, 2026-09-17

Measured sequentially on Windows, Electron 43.2.0 / Chromium 150, LegendList 3.3.5, production React, an 8-logical-CPU i5-10310U and 16 GiB RAM. Tests used a hidden offscreen Electron window, not the running chat. The same workload was used for baseline, atomic-move-only and two optimized runs. Counts and cumulative sanitization durations include initial setup; scroll frame statistics exclude it.

| Metric | Baseline | Optimized, two runs | Change |
| --- | ---: | ---: | --- |
| Sanitization calls across the workload | 211 | 41 / 41 | 80.6% fewer |
| Cumulative sanitization wall time | 2,175.9 ms | 387.2 / 395.0 ms | 81.8% to 82.2% less |
| Sanitizations in each of the last two warm scroll passes | 48 / 48 | 0 / 0 in both runs | Repeated work removed |
| Reloads of existing iframe elements during scrolling | 12 | 0 / 0 | Reordering reloads removed |
| Scroll frames over 32 ms, 192 samples per run | 106 | 34 / 46 | 56.6% to 67.9% fewer |
| Median of three per-pass p95 frame intervals | 83.3 ms | 66.6 / 66.7 ms | About 20% lower, directional |
| Cached key/value payload after workload | No cache | 970,668 bytes | Bounded memory-for-CPU trade-off |

The atomic-move-only run removed the measured reordering reloads, but repeated sanitization remained. This separates the lifecycle fix from the caching improvement. Raw samples, the failed initial hidden-window experiment and the investigation plan are retained as local QA evidence.

## Correctness checks

- `node desktop/scripts/test-legend-list-stateful-reorder.mjs`: passed for ESM/CJS order, stable nodes, atomic movement and fallback.
- `node desktop/scripts/benchmark-visualization-scroll.mjs --verify`: passed twice after optimization.
- `node desktop/scripts/test-visualization-renderer.mjs`: passed, including pre-effect height, cache hits across theme/title/export changes, entry/byte eviction, re-sanitization after eviction, HTML escaping, controls, CSP, opaque origin and denied network/scripts.
- `bun desktop/scripts/test-assistant-timeline-scroll.ts`: passed with 1,000 synthetic turns.
- `node desktop/scripts/test-assistant-timeline-presentation.mjs`: passed for startup, chat switching, hydration, paging and stale request ownership.
- The document-builder leaf module passed a scoped TypeScript check. No whole-app typecheck or production build was run.

## Limits and remaining verification

Frame timings are directional. Offscreen Chromium, virtual-list measurement warmup, iframe startup and unrelated machine load are confounders; these numbers do not establish a live-app FPS or total CPU/RAM improvement. A bounded cache adds memory rather than claiming memory savings.

Same-frame reloads and React remounts are different. Bottom-preview DOM identity across the prompt-update phase varied in an early optimized run; an extended repeat retained both bottom frames throughout all 12 updates. Do not claim every prompt-triggered flash is resolved from this fixture alone. Genuine virtualization unmounts can still recreate frames and reset native controls, as before. The next check is the user's exact prompt submission in the updated running renderer, with frame navigation and mount identity observed.

The independent reviewer was attempted twice but cancelled by the agent runner before producing findings. No independent audit is claimed. No user app was restarted. The dependency patch must be included in the running renderer's dependency bundle; already-built or prebundled code is not updated merely by changing its source on disk.

Reference: [MDN `Element.moveBefore`](https://developer.mozilla.org/en-US/docs/Web/API/Element/moveBefore), including iframe-state preservation and same-document constraints.
