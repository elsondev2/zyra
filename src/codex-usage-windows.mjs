const fiveHours = 5 * 60 * 60;
const oneDay = 24 * 60 * 60;
const oneWeek = 7 * oneDay;
const oneMonth = 30 * oneDay;
const oneYear = 365 * oneDay;

export function extractCodexUsageLimitWindows(data = {}, now = Date.now()) {
  const windows = [
    ...extractCodexRateLimitWindows(data?.rate_limit, { idPrefix: "codex", now }),
  ];

  for (const [index, item] of (Array.isArray(data?.additional_rate_limits) ? data.additional_rate_limits : []).entries()) {
    const scope = stringOrUndefined(item?.limit_name, item?.name, item?.id) ?? `Additional ${index + 1}`;
    windows.push(...extractCodexRateLimitWindows(item?.rate_limit ?? item, {
      idPrefix: `additional:${slug(scope)}:${index}`,
      scope,
      now,
    }));
  }

  windows.push(...extractCodexRateLimitWindows(data?.code_review_rate_limit, {
    idPrefix: "code-review",
    scope: "Code review",
    now,
  }));

  const reserved = new Set(["rate_limit", "additional_rate_limits", "code_review_rate_limit", "rate_limit_reset_credits"]);
  for (const [key, value] of Object.entries(data ?? {})) {
    if (reserved.has(key) || !/_rate_limits?$/i.test(key) || !value || typeof value !== "object") continue;
    const scope = humanizeIdentifier(key.replace(/_rate_limits?$/i, "")) || "Additional";
    windows.push(...extractCodexRateLimitWindows(value, {
      idPrefix: `named:${slug(key)}`,
      scope,
      now,
    }));
  }

  return dedupeCodexWindows(windows);
}

export function extractCodexRateLimitWindows(rateLimit, options = {}) {
  if (!rateLimit || typeof rateLimit !== "object") return [];
  const windows = [];
  const visitedObjects = new Set();
  const priorityKeys = ["primary_window", "secondary_window"];
  const entries = Object.entries(rateLimit);

  const pushWindow = (value, key, index = undefined) => {
    if (!looksLikeCodexLimitWindow(value) || visitedObjects.has(value)) return;
    visitedObjects.add(value);
    const explicitId = stringOrUndefined(value?.id, value?.window_id, value?.key);
    const suffix = index === undefined ? key : `${key}:${index}`;
    const normalized = normalizeCodexLimitWindow(value, {
      id: explicitId ?? `${options.idPrefix ?? "limit"}:${suffix}`,
      scope: options.scope,
      fallbackLabel: fallbackLabelForKey(key),
      sourceKey: key,
      now: options.now,
    });
    if (normalized) windows.push(normalized);
  };

  for (const key of priorityKeys) pushWindow(rateLimit[key], key);
  for (const [key, value] of entries) {
    if (priorityKeys.includes(key)) continue;
    if (Array.isArray(value)) {
      if (/windows?|limits?/i.test(key)) value.forEach((item, index) => pushWindow(item, key, index));
      continue;
    }
    if (/window/i.test(key) || looksLikeCodexLimitWindow(value)) pushWindow(value, key);
  }
  if (looksLikeCodexLimitWindow(rateLimit)) pushWindow(rateLimit, "window");
  return windows;
}

export function normalizeCodexLimitWindow(value, options = {}) {
  if (!looksLikeCodexLimitWindow(value)) return undefined;
  const usedPercent = firstNumber(value.used_percent, value.usedPercent, value.usage_percent, value.utilization_percent) ?? 0;
  const windowSeconds = firstNumber(
    value.limit_window_seconds,
    value.window_seconds,
    value.windowSeconds,
    value.duration_seconds,
    value.period_seconds,
  );
  const resetAt = normalizeResetAt(
    value.reset_at ?? value.resetAt ?? value.resets_at,
    value.reset_after_seconds ?? value.resetAfterSeconds,
    options.now,
  );
  return {
    id: String(options.id ?? value.id ?? "limit"),
    scope: stringOrUndefined(options.scope),
    label: meaningfulWindowLabel(value, options.fallbackLabel),
    usedPercent,
    resetAt,
    windowSeconds,
    sourceKey: stringOrUndefined(options.sourceKey),
  };
}

export function listCodexUsageWindows(usage = {}) {
  if (Array.isArray(usage.limitWindows)) {
    return dedupeCodexWindows(usage.limitWindows.filter(Boolean).map((window, index) => ({
      ...window,
      id: String(window.id ?? `limit:${index}`),
    })));
  }

  const windows = [];
  const pushLegacy = (bucket, id, scope, fallbackLabel) => {
    if (!bucket) return;
    windows.push({ ...bucket, id, scope, label: bucket.label ?? fallbackLabel });
  };
  pushLegacy(usage.primary, "legacy:primary", undefined, "Primary");
  pushLegacy(usage.secondary, "legacy:secondary", undefined, "Secondary");
  for (const [index, item] of (usage.additional ?? []).entries()) {
    const scope = item?.name || `Additional ${index + 1}`;
    if (Array.isArray(item?.windows)) {
      for (const [windowIndex, bucket] of item.windows.entries()) {
        pushLegacy(bucket, `legacy:additional:${index}:${windowIndex}`, scope, `Window ${windowIndex + 1}`);
      }
    } else {
      pushLegacy(item?.primary, `legacy:additional:${index}:primary`, scope, "Primary");
      pushLegacy(item?.secondary, `legacy:additional:${index}:secondary`, scope, "Secondary");
    }
  }
  pushLegacy(usage.codeReview, "legacy:code-review", "Code review", "Limit");
  return dedupeCodexWindows(windows);
}

export function formatCodexWindowIdentity(window = {}, fallback = "Limit") {
  const seconds = firstNumber(window.windowSeconds);
  if (seconds === fiveHours) return "Session (5h)";
  if (seconds === oneDay) return "Day (24h)";
  if (seconds === oneWeek) return "Week (7d)";
  if (seconds === oneMonth) return "Month (30d)";
  if (seconds === oneYear) return "Year (365d)";
  if (seconds && seconds > 0) {
    if (seconds % oneDay === 0) return `Window (${formatNumber(seconds / oneDay)}d)`;
    if (seconds % 3600 === 0) return `Window (${formatNumber(seconds / 3600)}h)`;
    if (seconds % 60 === 0) return `Window (${formatNumber(seconds / 60)}m)`;
    return `Window (${formatNumber(seconds)}s)`;
  }
  const label = meaningfulText(window.label);
  return label && !isPositionalLabel(label) ? label : fallback;
}

export function formatCodexUsageWindowLabel(window = {}, fallback = "Limit") {
  const identity = formatCodexWindowIdentity(window, fallback);
  const scope = meaningfulText(window.scope);
  if (!scope) return identity;
  if (identity === "Limit" || identity === scope) return scope;
  return `${scope} · ${identity}`;
}

function looksLikeCodexLimitWindow(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return [
    "used_percent", "usedPercent", "usage_percent", "utilization_percent",
    "reset_at", "resetAt", "resets_at", "reset_after_seconds", "resetAfterSeconds",
    "limit_window_seconds", "window_seconds", "windowSeconds", "duration_seconds", "period_seconds",
  ].some((key) => value[key] !== undefined);
}

function meaningfulWindowLabel(value, fallback) {
  const explicit = stringOrUndefined(value?.display_name, value?.window_name, value?.label, value?.name, value?.period);
  if (explicit && !isPositionalLabel(explicit)) return explicit;
  return stringOrUndefined(fallback);
}

function fallbackLabelForKey(key) {
  const normalized = String(key ?? "").toLowerCase();
  if (normalized === "primary_window") return "Primary";
  if (normalized === "secondary_window") return "Secondary";
  const humanized = humanizeIdentifier(normalized.replace(/_?windows?$/i, ""));
  return humanized || "Limit";
}

function dedupeCodexWindows(windows) {
  const seen = new Set();
  const result = [];
  for (const window of windows) {
    if (!window) continue;
    const key = String(window.id ?? `${window.scope ?? ""}:${window.sourceKey ?? ""}:${window.windowSeconds ?? ""}:${window.resetAt ?? ""}`);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(window);
  }
  return result;
}

function normalizeResetAt(value, afterSeconds, now = Date.now()) {
  if (value !== undefined && value !== null && value !== "") {
    const numeric = Number(value);
    const date = typeof value === "number" || (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value))
      ? new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000)
      : new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  const seconds = firstNumber(afterSeconds);
  return seconds === undefined ? undefined : new Date(Number(now) + seconds * 1000).toISOString();
}

function firstNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}

function stringOrUndefined(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function meaningfulText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isPositionalLabel(value) {
  return /^(primary|secondary)(?:\s+window)?$/i.test(String(value ?? "").trim());
}

function humanizeIdentifier(value) {
  return String(value ?? "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}

function slug(value) {
  return String(value ?? "limit").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "limit";
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}
