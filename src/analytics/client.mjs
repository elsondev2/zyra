import { randomUUID as nodeRandomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  ANALYTICS_CATALOG_ID,
  sanitizeAnalyticsEvent,
} from "./contracts.mjs";

const CONFIG_SCHEMA_VERSION = 1;
const PREFERENCE_SCHEMA_VERSION = 1;
const QUEUE_SCHEMA_VERSION = 1;
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_MAX_QUEUE_SIZE = 200;
const DEFAULT_FLUSH_INTERVAL_MS = 10_000;
const DEFAULT_INACTIVE_REFRESH_INTERVAL_MS = 1_000;
const DEFAULT_MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const QUEUE_LOCK_TIMEOUT_MS = 2_000;
const QUEUE_LOCK_STALE_MS = 10_000;
const QUEUE_CLAIM_TTL_MS = 30_000;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const DEFAULT_RETRY_DELAYS_MS = Object.freeze([250, 1_000, 4_000]);
const MAX_CONFIG_FILE_BYTES = 64 * 1024;
const MAX_QUEUE_FILE_BYTES = 2 * 1024 * 1024;
const MAX_IDENTITY_FILE_BYTES = 256;
const OFFICIAL_POSTHOG_HOSTS = new Set([
  "us.i.posthog.com",
  "eu.i.posthog.com",
]);
const PROJECT_KEY_PATTERN = /^phc_[A-Za-z0-9_-]{10,200}$/;
const HOSTNAME_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createProductAnalytics(options = {}) {
  return new ProductAnalyticsClient(options);
}

export class ProductAnalyticsClient {
  constructor(options = {}) {
    if (!options.storageDirectory) throw new Error("Analytics storageDirectory is required.");
    this.storageDirectory = path.resolve(options.storageDirectory);
    this.configPath = path.resolve(options.configPath || path.join(this.storageDirectory, "config.json"));
    this.preferencePath = path.resolve(options.preferencePath || this.configPath);
    this.requireExplicitPreference = options.requireExplicitPreference === true;
    this.identityPath = path.join(this.storageDirectory, "installation-id");
    this.queuePath = path.join(this.storageDirectory, "queue.json");
    this.queueLockPath = path.join(this.storageDirectory, "queue.lock");
    this.source = normalizeSource(options.source);
    this.appVersion = String(options.appVersion || "0.0.0");
    this.platform = normalizeAnalyticsPlatform(options.platform || process.platform);
    this.architecture = normalizeAnalyticsArchitecture(options.architecture || process.arch);
    this.env = options.env || process.env;
    this.transport = options.transport || createFetchTransport(options.fetch || globalThis.fetch);
    this.now = options.now || (() => new Date());
    this.randomUUID = options.randomUUID || nodeRandomUUID;
    this.sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.setTimer = options.setTimer || setTimeout;
    this.clearTimer = options.clearTimer || clearTimeout;
    this.batchSize = boundInteger(options.batchSize, 1, 50, DEFAULT_BATCH_SIZE);
    this.maxQueueSize = boundInteger(options.maxQueueSize, 1, 1_000, DEFAULT_MAX_QUEUE_SIZE);
    this.maxEventAgeMs = boundInteger(options.maxEventAgeMs, 1_000, 30 * 24 * 60 * 60 * 1_000, DEFAULT_MAX_EVENT_AGE_MS);
    this.flushIntervalMs = boundInteger(options.flushIntervalMs, 250, 300_000, DEFAULT_FLUSH_INTERVAL_MS);
    this.inactiveRefreshIntervalMs = boundInteger(options.inactiveRefreshIntervalMs, 100, 60_000, DEFAULT_INACTIVE_REFRESH_INTERVAL_MS);
    this.retryDelaysMs = Array.isArray(options.retryDelaysMs)
      ? options.retryDelaysMs.slice(0, 5).map((value) => boundInteger(value, 0, 60_000, 0))
      : [...DEFAULT_RETRY_DELAYS_MS];
    this.autoFlush = options.autoFlush !== false;
    this.config = disabledConfig("not_initialized");
    this.installationId = "";
    this.clientId = nodeRandomUUID();
    this.eventSequence = 0;
    this.queue = [];
    this.initializationPromise = null;
    this.operationQueue = Promise.resolve();
    this.flushTimer = null;
    this.closed = false;
    this.acceptingCaptures = true;
    this.cancellationGeneration = 0;
    this.activeFlushController = null;
    this.lastConfigurationRefreshAtMs = 0;
  }

  initialize() {
    if (!this.initializationPromise) {
      this.initializationPromise = this.initializeInternal().catch(() => {
        this.config = disabledConfig("config_invalid");
      });
    }
    return this.initializationPromise;
  }

  status() {
    return Object.freeze({
      requested: this.config.requested,
      preferenceSet: this.config.preferenceSet,
      enabled: this.config.active,
      configured: this.config.configured,
      reason: this.config.reason,
      hostCategory: this.config.hostCategory,
      enabledSource: this.config.enabledSource,
      canChangeEnabled: this.config.enabledSource !== "environment",
      queueSize: this.queue.length,
      catalogId: ANALYTICS_CATALOG_ID,
    });
  }

  refreshStatus() {
    return this.runExclusive(async () => {
      await this.initialize();
      await this.refreshPersistedConfiguration({ force: true });
      return this.status();
    });
  }

  updateEnabled(enabled) {
    if (typeof enabled !== "boolean") return Promise.reject(new Error("Analytics enabled value must be boolean."));
    if (!enabled && (this.requireExplicitPreference || parseEnabled(this.env.ZYRA_ANALYTICS_ENABLED) === undefined)) return this.disablePersistedAnalytics();
    return this.runExclusive(async () => {
      await this.initialize();
      if (this.config.enabledSource === "environment") return this.status();
      const persisted = await this.readPersistedConfigForUpdate();
      const next = { ...(isRecord(persisted) ? persisted : {}), schemaVersion: CONFIG_SCHEMA_VERSION, enabled: true };
      const proposed = resolveAnalyticsConfig({ env: this.configurationEnvironment(), persisted: next });
      await writeJsonAtomically(this.configPath, next);
      await this.writeSharedPreference(true);
      this.config = proposed;
      if (!proposed.active) {
        await this.clearInactiveQueue();
        return this.status();
      }
      if (!this.installationId) {
        this.installationId = await this.readOrCreateInstallationId();
        this.queue = await this.readQueue();
      }
      this.scheduleFlush();
      return this.status();
    });
  }

  async disablePersistedAnalytics() {
    await this.initialize();
    const repairMalformedConfig = this.config.reason === "config_invalid";
    await this.writeSharedPreference(false);
    this.cancellationGeneration += 1;
    this.activeFlushController?.abort();
    this.clearScheduledFlush();
    this.config = disabledConfig("disabled", "persisted", false, true);
    this.queue = [];
    try {
      const persisted = await this.readPersistedConfigForUpdate(repairMalformedConfig);
      const next = { ...(isRecord(persisted) ? persisted : {}), schemaVersion: CONFIG_SCHEMA_VERSION, enabled: false };
      await writeJsonAtomically(this.configPath, next);
    } catch (error) {
      if (this.preferencePath === this.configPath) throw error;
      // The shared preference is authoritative. A later startup repairs local state.
    }
    const queueCleanup = this.clearInactiveQueue({ forceLock: true }).catch(() => undefined);
    let cleanupTimer = null;
    await Promise.race([
      queueCleanup,
      new Promise((resolve) => {
        cleanupTimer = this.setTimer(resolve, 100);
        cleanupTimer?.unref?.();
      }),
    ]);
    if (cleanupTimer) this.clearTimer(cleanupTimer);
    return this.status();
  }

  configurationEnvironment() {
    if (!this.requireExplicitPreference || parseEnabled(this.env.ZYRA_ANALYTICS_ENABLED) === false) return this.env;
    return { ...this.env, ZYRA_ANALYTICS_ENABLED: undefined };
  }

  async writeSharedPreference(enabled) {
    if (this.preferencePath === this.configPath) return;
    await writeJsonAtomically(this.preferencePath, {
      schemaVersion: PREFERENCE_SCHEMA_VERSION,
      enabled,
    });
  }

  async readResolvedPersistedConfiguration() {
    const persistedConfig = await readConfigFile(this.configPath);
    if (this.preferencePath === this.configPath) return persistedConfig;
    const persistedPreference = await readConfigFile(this.preferencePath);
    if (persistedPreference.invalid) return { invalid: true, value: null };
    const preference = persistedPreference.value;
    if (isRecord(preference) && typeof preference.enabled === "boolean") {
      return {
        invalid: persistedConfig.invalid,
        value: {
          ...(isRecord(persistedConfig.value) ? persistedConfig.value : {}),
          enabled: preference.enabled,
        },
      };
    }
    if (this.requireExplicitPreference && isRecord(persistedConfig.value)) {
      const { enabled: _legacyEnabled, ...configuration } = persistedConfig.value;
      return { invalid: persistedConfig.invalid, value: configuration };
    }
    return persistedConfig;
  }

  async readPersistedConfigForUpdate(repairMalformed = false) {
    try {
      return await readJsonFileForUpdate(this.configPath);
    } catch (error) {
      if (error instanceof SyntaxError && (repairMalformed || this.config.reason === "config_invalid")) return null;
      throw error;
    }
  }

  capture(event, properties = {}) {
    if (!this.acceptingCaptures) return Promise.resolve(false);
    return this.runExclusive(async () => {
      await this.initialize();
      await this.refreshPersistedConfiguration();
      if (!this.config.active || !this.installationId) return false;
      const sanitized = sanitizeAnalyticsEvent({ event, properties }, this.commonProperties());
      if (!sanitized) return false;
      const entry = {
        id: `${this.clientId}:${++this.eventSequence}`,
        event: sanitized.event,
        properties: sanitized.properties,
        timestamp: this.now().toISOString(),
      };
      const persisted = await this.withQueueLock(async () => {
        await this.refreshPersistedConfiguration({ queueLockHeld: true });
        if (!this.config.active) return { accepted: false, queue: [] };
        const queue = await this.readQueueUnlocked();
        queue.push(entry);
        if (queue.length > this.maxQueueSize) queue.splice(0, queue.length - this.maxQueueSize);
        await this.persistQueueUnlocked(queue);
        return { accepted: true, queue };
      });
      this.queue = persisted.queue;
      if (!persisted.accepted) return false;
      if (this.autoFlush && this.queue.length >= this.batchSize) {
        await this.flushInternal({ maxAttempts: 1 });
      } else {
        this.scheduleFlush();
      }
      return true;
    });
  }

  flush(options = {}) {
    return this.runExclusive(async () => {
      await this.initialize();
      return this.flushInternal(options);
    });
  }

  async shutdown(options = {}) {
    this.acceptingCaptures = false;
    this.closed = true;
    this.cancellationGeneration += 1;
    this.activeFlushController?.abort();
    this.clearScheduledFlush();
    const timeoutMs = boundInteger(options.timeoutMs, 50, 10_000, 1_500);
    const flushPending = this.runExclusive(async () => {
      await this.initialize();
      return this.flushInternal({ maxAttempts: 1 });
    });
    let timeoutTimer = null;
    let timedOut = false;
    try {
      await Promise.race([
        flushPending,
        new Promise((resolve) => {
          timeoutTimer = this.setTimer(() => {
            timedOut = true;
            resolve(false);
          }, timeoutMs);
          timeoutTimer?.unref?.();
        }),
      ]);
    } catch {
      // Analytics never blocks or fails product shutdown.
    } finally {
      if (timeoutTimer) this.clearTimer(timeoutTimer);
      if (timedOut) {
        this.cancellationGeneration += 1;
        this.activeFlushController?.abort();
      }
    }
  }

  async refreshPersistedConfiguration({ queueLockHeld = false, force = false } = {}) {
    if (this.config.enabledSource === "environment") return;
    const nowMs = this.now().getTime();
    if (!force && !this.config.active && nowMs - this.lastConfigurationRefreshAtMs < this.inactiveRefreshIntervalMs) return;
    this.lastConfigurationRefreshAtMs = nowMs;
    const persistedConfig = await this.readResolvedPersistedConfiguration();
    const next = persistedConfig.invalid
      ? disabledConfig("config_invalid", "persisted")
      : resolveAnalyticsConfig({ env: this.configurationEnvironment(), persisted: persistedConfig.value });
    this.config = next;
    if (!next.active) {
      this.cancellationGeneration += 1;
      this.activeFlushController?.abort();
      this.clearScheduledFlush();
      await this.clearInactiveQueue({ queueLockHeld, forceLock: !queueLockHeld });
      return;
    }
    if (!this.installationId) {
      this.installationId = await this.readOrCreateInstallationId();
      this.queue = await this.readQueue();
    }
  }

  async clearInactiveQueue({ queueLockHeld = false, forceLock = false } = {}) {
    this.queue = [];
    if (queueLockHeld) {
      await rm(this.queuePath, { force: true });
      return;
    }
    if (!forceLock) {
      try {
        await stat(this.queuePath);
      } catch (error) {
        if (error?.code === "ENOENT") return;
        throw error;
      }
    }
    await this.withQueueLock(() => rm(this.queuePath, { force: true }));
  }

  async initializeInternal() {
    const persistedConfig = await this.readResolvedPersistedConfiguration();
    this.lastConfigurationRefreshAtMs = this.now().getTime();
    if (persistedConfig.invalid && parseEnabled(this.configurationEnvironment().ZYRA_ANALYTICS_ENABLED) === undefined) {
      this.config = disabledConfig("config_invalid", "persisted");
      await this.clearInactiveQueue();
      return;
    }
    this.config = resolveAnalyticsConfig({ env: this.configurationEnvironment(), persisted: persistedConfig.value });
    if (!this.config.active) {
      await this.clearInactiveQueue();
      return;
    }
    await mkdir(this.storageDirectory, { recursive: true });
    this.installationId = await this.readOrCreateInstallationId();
    this.queue = await this.readQueue();
    this.scheduleFlush();
  }

  async readOrCreateInstallationId() {
    await mkdir(this.storageDirectory, { recursive: true });
    const startedAt = Date.now();
    while (Date.now() - startedAt <= QUEUE_LOCK_TIMEOUT_MS) {
      try {
        const existing = (await readBoundedTextFile(this.identityPath, MAX_IDENTITY_FILE_BYTES)).trim();
        if (UUID_PATTERN.test(existing)) return existing.toLowerCase();
        const identityStats = await stat(this.identityPath);
        if (Date.now() - identityStats.mtimeMs > QUEUE_LOCK_STALE_MS) {
          await rm(this.identityPath, { force: true });
          continue;
        }
      } catch (error) {
        if (error?.code !== "ENOENT") {
          await this.sleep(20);
          continue;
        }
      }

      let handle = null;
      try {
        handle = await open(this.identityPath, "wx", 0o600);
        const next = String(this.randomUUID()).toLowerCase();
        if (!UUID_PATTERN.test(next)) throw new Error("Analytics identity generator returned an invalid UUID.");
        await handle.writeFile(`${next}\n`, { encoding: "utf8" });
        await handle.sync();
        await handle.close();
        handle = null;
        return next;
      } catch (error) {
        const ownedIdentityFile = Boolean(handle);
        if (handle) await handle.close().catch(() => undefined);
        if (ownedIdentityFile) await rm(this.identityPath, { force: true }).catch(() => undefined);
        if (!isRetryableExclusiveOpenError(error)) throw error;
      }
      await this.sleep(20);
    }
    throw Object.assign(new Error("Analytics installation identity is busy."), { code: "LOCK_TIMEOUT" });
  }

  async readQueue() {
    return this.withQueueLock(async () => {
      const queue = await this.readQueueUnlocked();
      await this.persistQueueUnlocked(queue);
      return queue;
    });
  }

  async readQueueUnlocked() {
    const stored = await readJsonFile(this.queuePath, MAX_QUEUE_FILE_BYTES);
    if (!isRecord(stored) || stored.schemaVersion !== QUEUE_SCHEMA_VERSION || !Array.isArray(stored.events)) return [];
    const nowMs = this.now().getTime();
    return stored.events.slice(-this.maxQueueSize).flatMap((entry) => {
      if (!isRecord(entry) || typeof entry.event !== "string" || typeof entry.timestamp !== "string") return [];
      const timestampMs = Date.parse(entry.timestamp);
      if (!Number.isFinite(timestampMs) || timestampMs - nowMs > MAX_FUTURE_CLOCK_SKEW_MS || nowMs - timestampMs > this.maxEventAgeMs) return [];
      const sanitized = sanitizeAnalyticsEvent({
        event: entry.event,
        properties: { ...this.commonProperties(), ...entry.properties },
      }, this.commonProperties());
      if (!sanitized) return [];
      const claimExpiresAt = Number(entry.claimExpiresAt);
      const claimedBy = typeof entry.claimedBy === "string" && claimExpiresAt > nowMs ? entry.claimedBy : undefined;
      return [{
        id: typeof entry.id === "string" && entry.id.length <= 160 ? entry.id : `legacy:${nodeRandomUUID()}`,
        event: sanitized.event,
        properties: sanitized.properties,
        timestamp: entry.timestamp,
        ...(claimedBy ? { claimedBy, claimExpiresAt } : {}),
      }];
    });
  }

  async flushInternal(options = {}) {
    await this.refreshPersistedConfiguration();
    if (!this.config.active || !this.installationId) return true;
    this.clearScheduledFlush();
    const maxAttempts = boundInteger(options.maxAttempts, 1, this.retryDelaysMs.length + 1, this.retryDelaysMs.length + 1);
    const batch = await this.withQueueLock(async () => {
      const queue = await this.readQueueUnlocked();
      const selected = queue.filter((entry) => !entry.claimedBy).slice(0, this.batchSize);
      const claimExpiresAt = this.now().getTime() + QUEUE_CLAIM_TTL_MS;
      const selectedIds = new Set(selected.map((entry) => entry.id));
      for (const entry of queue) {
        if (!selectedIds.has(entry.id)) continue;
        entry.claimedBy = this.clientId;
        entry.claimExpiresAt = claimExpiresAt;
      }
      await this.persistQueueUnlocked(queue);
      this.queue = queue;
      return selected;
    });
    if (batch.length === 0) {
      if (this.queue.length > 0) this.scheduleFlush();
      return true;
    }
    const payload = {
      api_key: this.config.projectKey,
      historical_migration: false,
      batch: batch.map((entry) => ({
        event: entry.event,
        timestamp: entry.timestamp,
        properties: {
          ...entry.properties,
          distinct_id: this.installationId,
          $process_person_profile: false,
          $lib: "zyra",
          $lib_version: this.appVersion,
        },
      })),
    };

    const flushGeneration = this.cancellationGeneration;
    const flushController = new AbortController();
    this.activeFlushController = flushController;
    try {
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        await this.refreshPersistedConfiguration();
        if (flushGeneration !== this.cancellationGeneration || !this.config.active) {
          await this.finishClaimedBatch(batch, false);
          return false;
        }
        let result;
        try {
          result = await this.transport({
            url: this.config.captureUrl,
            payload,
            timeoutMs: 3_000,
            signal: flushController.signal,
          });
        } catch {
          result = { ok: false, retryable: true };
        }
        if (flushGeneration !== this.cancellationGeneration || !this.config.active) {
          await this.finishClaimedBatch(batch, false);
          return false;
        }
        if (result?.ok || result?.retryable === false) {
          await this.finishClaimedBatch(batch, true);
          return Boolean(result.ok);
        }
        if (attempt + 1 < maxAttempts) await this.sleep(this.retryDelaysMs[attempt] || 0);
      }
      await this.finishClaimedBatch(batch, false);
      return false;
    } finally {
      if (this.activeFlushController === flushController) this.activeFlushController = null;
    }
  }

  async finishClaimedBatch(batch, removeEvents) {
    if (!this.config.active) {
      this.queue = [];
      return;
    }
    const batchIds = new Set(batch.map((entry) => entry.id));
    this.queue = await this.withQueueLock(async () => {
      const queue = await this.readQueueUnlocked();
      const next = removeEvents
        ? queue.filter((entry) => !batchIds.has(entry.id) || entry.claimedBy !== this.clientId)
        : queue.map((entry) => batchIds.has(entry.id) && entry.claimedBy === this.clientId
          ? withoutQueueClaim(entry)
          : entry);
      await this.persistQueueUnlocked(next);
      return next;
    });
    if (this.queue.length > 0) this.scheduleFlush();
  }

  async persistQueueUnlocked(queue) {
    if (queue.length > this.maxQueueSize) queue.splice(0, queue.length - this.maxQueueSize);
    let snapshot = { schemaVersion: QUEUE_SCHEMA_VERSION, events: queue };
    while (queue.length > 0 && Buffer.byteLength(JSON.stringify(snapshot), "utf8") > MAX_QUEUE_FILE_BYTES) {
      queue.shift();
      snapshot = { schemaVersion: QUEUE_SCHEMA_VERSION, events: queue };
    }
    await writeJsonAtomically(this.queuePath, snapshot);
  }

  async withQueueLock(work) {
    await mkdir(this.storageDirectory, { recursive: true });
    const startedAt = Date.now();
    let lockHandle = null;
    while (!lockHandle && Date.now() - startedAt <= QUEUE_LOCK_TIMEOUT_MS) {
      try {
        lockHandle = await open(this.queueLockPath, "wx", 0o600);
        await lockHandle.writeFile(`${process.pid}:${Date.now()}\n`, { encoding: "utf8" });
        await lockHandle.sync();
      } catch (error) {
        const ownedLockFile = Boolean(lockHandle);
        if (lockHandle) await lockHandle.close().catch(() => undefined);
        lockHandle = null;
        if (ownedLockFile) await rm(this.queueLockPath, { force: true }).catch(() => undefined);
        if (!isRetryableExclusiveOpenError(error)) throw error;
        const lockStats = await stat(this.queueLockPath).catch(() => null);
        if (lockStats && Date.now() - lockStats.mtimeMs > QUEUE_LOCK_STALE_MS) {
          await rm(this.queueLockPath, { force: true }).catch(() => undefined);
          continue;
        }
        await this.sleep(20);
      }
    }
    if (!lockHandle) throw Object.assign(new Error("Analytics queue is busy."), { code: "LOCK_TIMEOUT" });
    try {
      return await work();
    } finally {
      await lockHandle.close().catch(() => undefined);
      await rm(this.queueLockPath, { force: true }).catch(() => undefined);
    }
  }

  scheduleFlush() {
    if (!this.autoFlush || this.closed || !this.config.active || this.queue.length === 0 || this.flushTimer) return;
    this.flushTimer = this.setTimer(() => {
      this.flushTimer = null;
      void this.flush().catch(() => undefined);
    }, this.flushIntervalMs);
    this.flushTimer?.unref?.();
  }

  clearScheduledFlush() {
    if (!this.flushTimer) return;
    this.clearTimer(this.flushTimer);
    this.flushTimer = null;
  }

  commonProperties() {
    return {
      schema_version: 1,
      source: this.source,
      app_version: this.appVersion,
      platform: this.platform,
      architecture: this.architecture,
    };
  }

  runExclusive(work) {
    const next = this.operationQueue.then(work, work);
    this.operationQueue = next.then(() => undefined, () => undefined);
    return next;
  }
}

export function isRetryableExclusiveOpenError(error, platform = process.platform) {
  const code = error && typeof error === "object" ? error.code : undefined;
  return code === "EEXIST" || (platform === "win32" && (code === "EPERM" || code === "EACCES"));
}

export function resolveAnalyticsConfig({ env = {}, persisted = null } = {}) {
  const environmentEnabled = parseEnabled(env.ZYRA_ANALYTICS_ENABLED);
  if (isRecord(persisted) && persisted.schemaVersion !== undefined && persisted.schemaVersion !== CONFIG_SCHEMA_VERSION && environmentEnabled === undefined) {
    return disabledConfig("config_invalid", "persisted");
  }
  const record = isRecord(persisted) && (persisted.schemaVersion === undefined || persisted.schemaVersion === CONFIG_SCHEMA_VERSION)
    ? persisted
    : {};
  if (environmentEnabled === "invalid") return disabledConfig("config_invalid", "environment");
  const enabledSource = environmentEnabled === undefined ? "persisted" : "environment";
  const preferenceSet = environmentEnabled !== undefined || typeof record.enabled === "boolean";
  const requested = environmentEnabled === undefined ? record.enabled === true : environmentEnabled;
  if (!requested) return disabledConfig("disabled", enabledSource, false, preferenceSet);

  const projectKey = String(env.ZYRA_POSTHOG_PROJECT_KEY ?? record.projectKey ?? "").trim();
  const rawHost = String(env.ZYRA_POSTHOG_HOST ?? record.host ?? "").trim();
  const customHosts = normalizeAllowedHosts(env.ZYRA_POSTHOG_ALLOWED_HOSTS ?? record.allowedHosts);
  if (!PROJECT_KEY_PATTERN.test(projectKey)) return disabledConfig("project_key_invalid", enabledSource, true, preferenceSet);
  const endpoint = validatePostHogEndpoint(rawHost, customHosts);
  if (!endpoint.valid) return disabledConfig(endpoint.reason, enabledSource, true, preferenceSet);
  return Object.freeze({
    requested: true,
    preferenceSet,
    configured: true,
    active: true,
    reason: "ready",
    enabledSource,
    projectKey,
    captureUrl: endpoint.captureUrl,
    hostCategory: endpoint.hostCategory,
  });
}

export function validatePostHogEndpoint(value, customAllowedHosts = []) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    return { valid: false, reason: "host_invalid" };
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash) {
    return { valid: false, reason: "host_invalid" };
  }
  if (url.pathname !== "/" && url.pathname !== "") return { valid: false, reason: "host_invalid" };
  const hostname = url.hostname.toLowerCase();
  if (!HOSTNAME_PATTERN.test(hostname) || hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { valid: false, reason: "host_invalid" };
  }
  const allowed = OFFICIAL_POSTHOG_HOSTS.has(hostname) || customAllowedHosts.includes(hostname);
  if (!allowed) return { valid: false, reason: "host_not_allowed" };
  const captureUrl = new URL("/batch/", `${url.origin}/`).toString();
  return {
    valid: true,
    captureUrl,
    hostCategory: hostname === "eu.i.posthog.com" ? "posthog_eu" : hostname === "us.i.posthog.com" ? "posthog_us" : "custom",
  };
}

export function createFetchTransport(fetchImplementation) {
  if (typeof fetchImplementation !== "function") {
    return async () => ({ ok: false, retryable: true });
  }
  return async ({ url, payload, timeoutMs, signal }) => {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener?.("abort", abortFromCaller, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();
    try {
      const response = await fetchImplementation(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
        redirect: "error",
        referrerPolicy: "no-referrer",
        credentials: "omit",
      });
      return {
        ok: response.ok,
        retryable: response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500,
      };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", abortFromCaller);
    }
  };
}

function withoutQueueClaim(entry) {
  const { claimedBy: _claimedBy, claimExpiresAt: _claimExpiresAt, ...unclaimed } = entry;
  return unclaimed;
}

function disabledConfig(reason, enabledSource = "persisted", requested = false, preferenceSet = false) {
  return Object.freeze({
    requested,
    preferenceSet,
    configured: false,
    active: false,
    reason,
    enabledSource,
    projectKey: "",
    captureUrl: "",
    hostCategory: "none",
  });
}

function normalizeAllowedHosts(value) {
  const entries = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(entries
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter((entry) => HOSTNAME_PATTERN.test(entry) && entry !== "localhost" && !entry.endsWith(".localhost")))]
    .slice(0, 16);
}

function parseEnabled(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === true || value === "1" || String(value).toLowerCase() === "true") return true;
  if (value === false || value === "0" || String(value).toLowerCase() === "false") return false;
  return "invalid";
}

function normalizeSource(value) {
  return ["desktop_main", "desktop_renderer", "cli"].includes(value) ? value : "cli";
}

export function normalizeAnalyticsPlatform(value) {
  return ["win32", "darwin", "linux"].includes(value) ? value : "other";
}

export function normalizeAnalyticsArchitecture(value) {
  return ["x64", "arm64", "ia32"].includes(value) ? value : "other";
}

function boundInteger(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function readConfigFile(filePath) {
  let raw;
  try {
    raw = await readBoundedTextFile(filePath, MAX_CONFIG_FILE_BYTES);
  } catch (error) {
    return { value: null, invalid: error?.code !== "ENOENT" };
  }
  try {
    return { value: JSON.parse(raw), invalid: false };
  } catch {
    return { value: null, invalid: true };
  }
}

async function readJsonFile(filePath, maxBytes = MAX_CONFIG_FILE_BYTES) {
  try {
    return JSON.parse(await readBoundedTextFile(filePath, maxBytes));
  } catch {
    return null;
  }
}

async function readJsonFileForUpdate(filePath) {
  let raw;
  try {
    raw = await readBoundedTextFile(filePath, MAX_CONFIG_FILE_BYTES);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  return JSON.parse(raw);
}

async function readBoundedTextFile(filePath, maxBytes) {
  const fileStats = await stat(filePath);
  if (!fileStats.isFile() || fileStats.size > maxBytes) throw Object.assign(new Error("Analytics state file exceeds its size limit."), { code: "EFBIG" });
  return readFile(filePath, "utf8");
}

async function writeJsonAtomically(filePath, value) {
  await writeTextAtomically(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTextAtomically(filePath, value) {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${nodeRandomUUID()}`;
  let handle = null;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(value, { encoding: "utf8" });
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporaryPath, filePath);
    const directoryHandle = await open(directory, "r").catch(() => null);
    if (directoryHandle) {
      try {
        await directoryHandle.sync().catch((error) => {
          if (process.platform !== "win32" || (error?.code !== "EPERM" && error?.code !== "EINVAL")) throw error;
        });
      } finally {
        await directoryHandle.close();
      }
    }
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
