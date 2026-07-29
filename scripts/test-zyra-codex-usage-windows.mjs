import assert from "node:assert/strict";
import {
  extractCodexUsageLimitWindows,
  formatCodexUsageWindowLabel,
  listCodexUsageWindows,
} from "../src/codex-usage-windows.mjs";
import { renderCodexUsageBox } from "../src/terminal-blocks.mjs";
import { stripAnsi } from "../src/tui/render-utils.mjs";
import { formatCodexUsageStats, normalizeCodexUsageStats } from "../src/zyra-sdk.mjs";

const now = Date.parse("2026-07-17T12:00:00.000Z");
const weeklyOnlyPayload = {
  plan_type: "pro",
  rate_limit: {
    primary_window: {
      used_percent: 33,
      limit_window_seconds: 7 * 24 * 60 * 60,
      reset_at: "2026-07-23T08:25:32.000Z",
    },
  },
  additional_rate_limits: [
    {
      limit_name: "GPT-5.3-Codex-Spark",
      rate_limit: {
        primary_window: {
          used_percent: 0,
          limit_window_seconds: 7 * 24 * 60 * 60,
          reset_at: "2026-07-23T08:33:47.000Z",
        },
      },
    },
  ],
};

const weeklyOnly = normalizeCodexUsageStats(weeklyOnlyPayload, "test");
assert.equal(weeklyOnly.limitWindows.length, 2, "all returned windows count, including a zero-used named limit");
assert.equal(formatCodexUsageWindowLabel(weeklyOnly.limitWindows[0]), "Week (7d)");
assert.equal(formatCodexUsageWindowLabel(weeklyOnly.limitWindows[1]), "GPT-5.3-Codex-Spark · Week (7d)");
const weeklyText = stripAnsi(renderCodexUsageBox(weeklyOnly, undefined, 120).join("\n"));
assert.match(weeklyText, /Week \(7d\)/);
assert.match(weeklyText, /GPT-5\.3-Codex-Spark · Week \(7d\)/);
assert.doesNotMatch(weeklyText, /Session \(5h\)/, "a weekly primary_window is never mislabeled as a five-hour session");
assert.doesNotMatch(formatCodexUsageStats(weeklyOnly).join("\n"), /Session \(5h\)/);

const restoredFiveHourPayload = {
  rate_limit: {
    primary_window: { used_percent: 20, limit_window_seconds: 5 * 60 * 60 },
    secondary_window: { used_percent: 40, limit_window_seconds: 7 * 24 * 60 * 60 },
  },
};
const restoredFiveHour = normalizeCodexUsageStats(restoredFiveHourPayload, "test");
assert.deepEqual(restoredFiveHour.limitWindows.map(formatCodexUsageWindowLabel), ["Session (5h)", "Week (7d)"]);

const openEndedPayload = {
  rate_limit: {
    windows: [
      { id: "daily", used_percent: 10, duration_seconds: 24 * 60 * 60 },
      { id: "fortnight", used_percent: 25, period_seconds: 14 * 24 * 60 * 60 },
    ],
    monthly_window: { used_percent: 50, window_seconds: 30 * 24 * 60 * 60 },
  },
  image_rate_limit: {
    rolling_window: {
      used_percent: 0,
      window_seconds: 2 * 60 * 60,
      reset_after_seconds: 3600,
    },
  },
};
const openEnded = extractCodexUsageLimitWindows(openEndedPayload, now);
assert.equal(openEnded.length, 4, "window arrays, named windows, and future top-level rate limits are all retained");
assert.deepEqual(openEnded.map(formatCodexUsageWindowLabel), [
  "Day (24h)",
  "Window (14d)",
  "Month (30d)",
  "Image · Window (2h)",
]);
assert.equal(openEnded[3].resetAt, "2026-07-17T13:00:00.000Z");

const legacy = listCodexUsageWindows({
  primary: { usedPercent: 1, windowSeconds: 24 * 60 * 60 },
  secondary: { usedPercent: 2, windowSeconds: 365 * 24 * 60 * 60 },
});
assert.deepEqual(legacy.map(formatCodexUsageWindowLabel), ["Day (24h)", "Year (365d)"]);

const emptyText = stripAnsi(renderCodexUsageBox({ source: "test" }, undefined, 100).join("\n"));
assert.match(emptyText, /No rate-limit windows returned by ChatGPT/);
assert.doesNotMatch(emptyText, /unknown.*Session|unknown.*Week/);

console.log("Zyra Codex usage-window identity: ok");
