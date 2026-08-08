import { randomUUID } from "node:crypto";
import {
  extractCodexRateLimitWindows,
  extractCodexUsageLimitWindows,
  formatCodexUsageWindowLabel,
  listCodexUsageWindows,
  normalizeCodexLimitWindow,
} from "./codex-usage-windows.mjs";

const CHATGPT_ACCOUNT_PROVIDER = "openai-codex";
const CODEX_ACCOUNT_API_BASE = "https://chatgpt.com/backend-api";

let piAuthStoragePromise;

async function loadPiAuthStorage() {
  if (!piAuthStoragePromise) {
    const packageEntry = import.meta.resolve("@earendil-works/pi-coding-agent");
    const authStorageUrl = new URL("./core/auth-storage.js", packageEntry);
    piAuthStoragePromise = import(authStorageUrl.href)
      .then((module) => {
        if (typeof module.AuthStorage !== "function") {
          throw new Error("Pi auth storage is unavailable.");
        }
        return module.AuthStorage;
      })
      .catch((error) => {
        piAuthStoragePromise = undefined;
        throw error;
      });
  }
  return piAuthStoragePromise;
}

export async function buildChatGptAccountStatus(provider = CHATGPT_ACCOUNT_PROVIDER) {
  const AuthStorage = await loadPiAuthStorage();
  const authStorage = AuthStorage.create();
  const status = authStorage.getAuthStatus(provider);
  let credential = authStorage.get(provider);
  let claims = extractOpenAiCodexClaims(credential?.access);

  if (provider === CHATGPT_ACCOUNT_PROVIDER && status.configured) {
    const access = await authStorage.getApiKey(provider, { includeFallback: false }).catch(() => undefined);
    credential = authStorage.get(provider) ?? credential;
    claims = extractOpenAiCodexClaims(credential?.access ?? access) ?? claims;
  }

  let usage;
  let usageError;
  if (provider === CHATGPT_ACCOUNT_PROVIDER && status.configured) {
    try {
      usage = await fetchCodexUsageStats();
    } catch (error) {
      usageError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    provider,
    status,
    email: claims?.email,
    emailVerified: claims?.emailVerified,
    plan: claims?.plan ?? usage?.plan,
    accountId: credential?.accountId ?? claims?.accountId,
    tokenExpiresAt: normalizeResetAt(credential?.expires),
    usage,
    usageError,
    updatedAt: new Date().toISOString(),
  };
}

export const buildZyraAuthAccountStatus = buildChatGptAccountStatus;

export function formatZyraAuthAccountStatus(account = {}) {
  const separator = "─".repeat(58);
  const status = account.status?.configured ? "logged in" : "not logged in";
  const source = account.status?.source ? ` (${account.status.source})` : "";
  const lines = ["", separator, "Account status", ""];
  lines.push(` Provider: ${account.provider ?? CHATGPT_ACCOUNT_PROVIDER}`);
  lines.push(` Status: ${status}${source}`);
  lines.push(` Email: ${account.email ?? "unknown"}${account.emailVerified === true ? " ✓" : ""}`);
  lines.push(` Plan: ${account.plan ?? "unknown"}`);
  lines.push(` Account: ${shortId(account.accountId)}`);
  lines.push(` Token: ${account.tokenExpiresAt ? `expires ${formatLocalDateTime(account.tokenExpiresAt)}` : "unknown"}`);

  if (account.usage) {
    lines.push("", "Limits:");
    const windows = listCodexUsageWindows(account.usage);
    if (windows.length === 0) lines.push(" No rate-limit windows returned by ChatGPT.");
    for (const window of windows) {
      appendUsageWindow(lines, formatCodexUsageWindowLabel(window), window);
    }
  } else if (account.usageError) {
    lines.push("", ` Limits: unavailable — ${account.usageError}`);
  } else {
    lines.push("", " Limits: not checked");
  }

  lines.push("", ` Updated: ${formatLocalDateTime(account.updatedAt)}`, separator);
  return lines;
}

export async function fetchCodexUsageStats() {
  const { data, auth } = await requestCodexAccountJson("/wham/usage");
  return normalizeCodexUsageStats(data, auth.source, auth);
}

export async function fetchCodexResetCredits() {
  const { data } = await requestCodexAccountJson("/wham/rate-limit-reset-credits");
  return normalizeCodexResetCredits(data);
}

export async function redeemCodexResetCredit(creditId) {
  const normalizedId = String(creditId ?? "").trim();
  if (!normalizedId) throw new Error("Choose a banked Codex reset before redeeming.");
  const { data } = await requestCodexAccountJson("/wham/rate-limit-reset-credits/consume", {
    method: "POST",
    body: JSON.stringify({
      credit_id: normalizedId,
      redeem_request_id: randomUUID(),
    }),
  });
  return normalizeCodexResetRedemption(data);
}

export function formatCodexUsageStats(stats) {
  const separator = "─".repeat(54);
  const lines = ["", separator, "Codex usage", ""];
  lines.push(` Source: ${stats.source}`);
  lines.push(` Plan: ${stats.plan ?? "unknown"}`);
  if (stats.availableResetCount !== undefined) {
    lines.push(` Banked resets: ${stats.availableResetCount}`);
  }
  lines.push("");

  const windows = listCodexUsageWindows(stats);
  for (const window of windows) {
    const label = formatCodexUsageWindowLabel(window);
    lines.push(` ${label.padEnd(14)} ${formatUsagePercent(window.usedPercent)}${formatReset(window.resetAt)}`);
  }

  if (windows.length === 0) lines.push(" No rate-limit windows returned by ChatGPT.");
  lines.push("", ` Updated: ${formatLocalDateTime(stats.updatedAt)}`, separator);
  return lines;
}

export async function resolveChatGptAccountAuth() {
  const AuthStorage = await loadPiAuthStorage();
  const authStorage = AuthStorage.create();
  const accessToken = await authStorage.getApiKey(CHATGPT_ACCOUNT_PROVIDER, { includeFallback: false });
  if (!accessToken) return undefined;

  const credential = authStorage.get(CHATGPT_ACCOUNT_PROVIDER);
  const claims = extractOpenAiCodexClaims(credential?.access ?? accessToken);
  return {
    source: "Pi auth storage",
    accessToken,
    accountId: typeof credential?.accountId === "string" ? credential.accountId : claims?.accountId,
    email: claims?.email,
  };
}

export const resolveZyraSubscriptionAuth = resolveChatGptAccountAuth;

export function normalizeCodexUsageStats(data, source, auth = {}) {
  const rateLimit = data?.rate_limit ?? {};
  const additional = Array.isArray(data?.additional_rate_limits)
    ? data.additional_rate_limits.map((item, index) => ({
        name: String(item?.limit_name ?? item?.name ?? item?.id ?? `Additional ${index + 1}`),
        primary: normalizeCodexLimitWindow(item?.rate_limit?.primary_window),
        secondary: normalizeCodexLimitWindow(item?.rate_limit?.secondary_window),
        windows: extractCodexRateLimitWindows(item?.rate_limit ?? item, {
          idPrefix: `legacy-additional:${index}`,
          scope: String(item?.limit_name ?? item?.name ?? item?.id ?? `Additional ${index + 1}`),
        }),
      }))
    : [];
  const codeReviewWindows = extractCodexRateLimitWindows(data?.code_review_rate_limit, {
    idPrefix: "legacy-code-review",
    scope: "Code review",
  });

  return {
    source,
    account: auth.email ?? data?.email ?? data?.account_email,
    plan: data?.plan_type ?? data?.plan ?? "unknown",
    updatedAt: new Date().toISOString(),
    primary: normalizeCodexLimitWindow(rateLimit.primary_window),
    secondary: normalizeCodexLimitWindow(rateLimit.secondary_window),
    additional,
    codeReview: normalizeCodexLimitWindow(data?.code_review_rate_limit?.primary_window),
    codeReviewWindows,
    limitWindows: extractCodexUsageLimitWindows(data),
    availableResetCount: firstNumber(data?.rate_limit_reset_credits?.available_count),
  };
}

export function normalizeCodexResetCredits(data) {
  const credits = Array.isArray(data?.credits)
    ? data.credits
        .map(normalizeCodexResetCredit)
        .filter(Boolean)
        .sort(compareCodexResetCredits)
    : [];
  const reportedCount = firstNumber(data?.available_count);
  return {
    availableCount: reportedCount ?? credits.filter(isCodexResetCreditAvailable).length,
    credits,
  };
}

export function normalizeCodexResetCredit(value) {
  if (!value || typeof value.id !== "string" || !value.id) return undefined;
  return {
    id: value.id,
    title: String(value.title ?? "Codex rate-limit reset"),
    status: String(value.status ?? "unknown").toLowerCase(),
    resetType: stringOrUndefined(value.reset_type),
    grantedAt: normalizeResetAt(value.granted_at),
    expiresAt: normalizeResetAt(value.expires_at),
    description: stringOrUndefined(value.description),
  };
}

export function normalizeCodexResetRedemption(data) {
  return {
    code: stringOrUndefined(data?.code),
    windowsReset: firstNumber(data?.windows_reset),
    redeemedAt: normalizeResetAt(data?.credit?.redeemed_at),
    credit: normalizeCodexResetCredit(data?.credit),
  };
}

export function isCodexResetCreditAvailable(credit, now = Date.now()) {
  if (credit?.status !== "available") return false;
  if (!credit.expiresAt) return true;
  return new Date(credit.expiresAt).getTime() > now;
}

async function requestCodexAccountJson(pathname, init = {}) {
  const auth = await resolveChatGptAccountAuth();
  if (!auth) {
    throw new Error("No ChatGPT account is connected through Pi. Run /login or `zyra login subscription`.");
  }

  const response = await fetchCodexAccountWithAuth(auth, pathname, init);
  const raw = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(formatCodexUsageHttpFailure(response.status, response.statusText, raw));
  }
  if (!raw) return { data: {}, auth };
  try {
    return { data: JSON.parse(raw), auth };
  } catch {
    throw new Error(`Codex account request failed (${response.status}): expected JSON response.`);
  }
}

function fetchCodexAccountWithAuth(auth, pathname, init = {}) {
  const headers = {
    Authorization: `Bearer ${auth.accessToken}`,
    Accept: "application/json",
    "User-Agent": "zyra-codex-resets/1.0",
    Origin: "https://chatgpt.com",
  };
  if (auth.accountId) headers["ChatGPT-Account-Id"] = auth.accountId;
  if (init.body) headers["Content-Type"] = "application/json";
  return fetch(`${CODEX_ACCOUNT_API_BASE}${pathname}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
}

function extractOpenAiCodexClaims(accessToken) {
  const payload = decodeJwtPayload(accessToken);
  const auth = payload?.["https://api.openai.com/auth"] ?? {};
  const profile = payload?.["https://api.openai.com/profile"] ?? {};
  if (!payload) return undefined;
  return {
    email: typeof profile.email === "string" ? profile.email : undefined,
    emailVerified: typeof profile.email_verified === "boolean" ? profile.email_verified : undefined,
    plan: typeof auth.chatgpt_plan_type === "string" ? auth.chatgpt_plan_type : undefined,
    accountId: typeof auth.chatgpt_account_id === "string" ? auth.chatgpt_account_id : undefined,
  };
}

function decodeJwtPayload(token) {
  if (typeof token !== "string") return undefined;
  const parts = token.split(".");
  if (parts.length < 2) return undefined;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
}

function appendUsageWindow(lines, label, bucket, options = {}) {
  if (!bucket) {
    if (!options.hideEmpty) lines.push(` ${label.padEnd(16)} unknown`);
    return;
  }
  if (options.hideEmpty && bucket.usedPercent <= 0) return;
  lines.push(` ${label.padEnd(16)} ${formatUsagePercent(bucket.usedPercent)}${formatReset(bucket.resetAt)}`);
}

function shortId(value) {
  const text = String(value ?? "");
  if (!text) return "unknown";
  return text.length <= 14 ? text : `${text.slice(0, 8)}…${text.slice(-4)}`;
}

function compareCodexResetCredits(left, right) {
  const availability = Number(isCodexResetCreditAvailable(right)) - Number(isCodexResetCreditAvailable(left));
  if (availability !== 0) return availability;
  return resetDateValue(left.expiresAt, Number.MAX_SAFE_INTEGER) - resetDateValue(right.expiresAt, Number.MAX_SAFE_INTEGER);
}

function formatCodexUsageHttpFailure(status, statusText, body) {
  if (isCloudflareChallenge(body)) {
    return `Codex usage request failed (${status}): ChatGPT returned a Cloudflare browser challenge. Try again after /reload, or check https://chatgpt.com/codex/settings/usage in the browser.`;
  }
  const clean = stripHtml(body).replace(/\s+/g, " ").trim();
  const detail = clean ? `: ${clean.slice(0, 240)}${clean.length > 240 ? "…" : ""}` : `: ${statusText}`;
  return `Codex usage request failed (${status})${detail}`;
}

function isCloudflareChallenge(body) {
  return /__cf_chl_|challenge-platform|Enable JavaScript and cookies|cloudflare/i.test(String(body ?? ""));
}

function stripHtml(value) {
  return String(value ?? "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ");
}

function stringOrUndefined(value) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function resetDateValue(value, fallback) {
  if (!value) return fallback;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}

function normalizeResetAt(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function formatUsagePercent(usedPercent) {
  const used = Math.max(0, Math.min(100, Number(usedPercent) || 0));
  const left = Math.max(0, 100 - used);
  return `${formatPercent(used)} used (${formatPercent(left)} left)`;
}

function formatPercent(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

function formatReset(iso) {
  if (!iso) return "";
  const reset = new Date(iso);
  const millis = reset.getTime() - Date.now();
  if (!Number.isFinite(millis) || millis <= 0) return "";
  return ` · resets in ${formatDuration(millis)}`;
}

function formatDuration(millis) {
  const minutes = Math.max(0, Math.round(millis / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d${hours ? ` ${hours}h` : ""}`;
  if (hours > 0) return `${hours}h${mins ? `${mins}m` : ""}`;
  return `${mins}m`;
}

function formatLocalDateTime(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? String(iso ?? "unknown") : date.toLocaleString();
}
