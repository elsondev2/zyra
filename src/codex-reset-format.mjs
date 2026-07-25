import { formatCodexUsageWindowLabel, listCodexUsageWindows } from "./codex-usage-windows.mjs";

export function formatCodexResetCreditsSummary(resetCredits = {}) {
  const availableCount = Number(resetCredits.availableCount) || 0;
  const lines = [`${availableCount} banked reset${availableCount === 1 ? "" : "s"} available`];
  for (const [index, credit] of (resetCredits.credits ?? []).entries()) {
    lines.push(`${index + 1}. ${credit.title} · ${credit.status} · ${formatCodexResetExpiration(credit.expiresAt)}`);
  }
  return lines;
}

export function formatCodexResetChoiceDescription(credit = {}) {
  const parts = [capitalize(credit.status || "unknown"), formatCodexResetExpiration(credit.expiresAt)];
  if (credit.grantedAt) parts.push(`granted ${formatLocalDateTime(credit.grantedAt)}`);
  return parts.join(" · ");
}

export function formatCodexResetRedemptionWarning(credit = {}, usage = {}) {
  const usageParts = listCodexUsageWindows(usage).map((window) => formatWindowUsage(window));
  return [
    credit.title || "Codex rate-limit reset",
    formatCodexResetExpiration(credit.expiresAt),
    usageParts.length > 0 ? `Current usage: ${usageParts.join(", ")}` : undefined,
    "This immediately spends one banked credit and cannot be undone.",
  ].filter(Boolean).join("\n");
}

export function formatCodexUsageSnapshot(stats = {}) {
  const parts = listCodexUsageWindows(stats).map((window) => formatWindowUsage(window));
  return parts.length > 0 ? parts.join(" · ") : "usage windows unavailable";
}

export function formatCodexResetExpiration(iso) {
  if (!iso) return "expiry unavailable";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "expiry unavailable";
  const remaining = date.getTime() - Date.now();
  if (remaining <= 0) return `expired ${date.toLocaleString()}`;
  return `expires ${date.toLocaleString()} (${formatDuration(remaining)} left)`;
}

function formatWindowUsage(bucket) {
  return `${formatCodexUsageWindowLabel(bucket).toLowerCase()} ${formatPercent(bucket.usedPercent)} used`;
}

function formatDuration(millis) {
  const minutes = Math.max(0, Math.ceil(millis / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d${hours ? ` ${hours}h` : ""}`;
  if (hours > 0) return `${hours}h${mins ? ` ${mins}m` : ""}`;
  return `${mins}m`;
}

function formatPercent(value) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  const rounded = Math.round(clamped * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

function formatLocalDateTime(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? String(iso) : date.toLocaleString();
}

function capitalize(value) {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}
