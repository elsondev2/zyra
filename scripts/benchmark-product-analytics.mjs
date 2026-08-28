#!/usr/bin/env node
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { createProductAnalytics } from "../src/analytics/client.mjs";

const VALID_ENV = {
  ZYRA_ANALYTICS_ENABLED: "1",
  ZYRA_POSTHOG_PROJECT_KEY: "phc_benchmark_placeholder_1234567890",
  ZYRA_POSTHOG_HOST: "https://us.i.posthog.com",
};
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "zyra-analytics-benchmark-"));

try {
  const disabled = { ...(await measure("disabled", {}, async () => ({ ok: true, retryable: false }))), requests: 0, transportedEvents: 0, networkBytes: 0 };
  let requests = 0;
  let events = 0;
  let networkBytes = 0;
  const enabled = await measure("fake-enabled", VALID_ENV, async ({ payload }) => {
    requests += 1;
    events += payload.batch.length;
    networkBytes += Buffer.byteLength(JSON.stringify(payload), "utf8");
    return { ok: true, retryable: false };
  });
  const report = {
    schemaVersion: 1,
    sampleEvents: 100,
    disabled,
    fakeEnabled: { ...enabled, requests, transportedEvents: events, networkBytes },
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function measure(label, env, transport) {
  global.gc?.();
  const eventLoopDelay = monitorEventLoopDelay({ resolution: 10 });
  eventLoopDelay.enable();
  const heapBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  const client = createProductAnalytics({
    storageDirectory: path.join(temporaryRoot, label),
    source: "cli",
    appVersion: "0.6.0",
    platform: process.platform,
    architecture: process.arch,
    env,
    transport,
    autoFlush: false,
    batchSize: 20,
    maxQueueSize: 200,
    randomUUID: () => "123e4567-e89b-42d3-a456-426614174000",
  });
  await client.initialize();
  const initializationMs = performance.now() - startedAt;
  const captureStartedAt = performance.now();
  for (let index = 0; index < 100; index += 1) {
    await client.capture("zyra_v1_cli", { action: "slash_command", command: "commands", outcome: "completed" });
  }
  const captureMs = performance.now() - captureStartedAt;
  const flushStartedAt = performance.now();
  while (client.status().queueSize > 0) await client.flush({ maxAttempts: 1 });
  const flushMs = performance.now() - flushStartedAt;
  global.gc?.();
  const heapAfter = process.memoryUsage().heapUsed;
  eventLoopDelay.disable();
  await client.shutdown({ timeoutMs: 250 });
  return {
    initializationMs: round(initializationMs),
    capture100Ms: round(captureMs),
    flushMs: round(flushMs),
    heapDeltaBytes: heapAfter - heapBefore,
    maxEventLoopDelayMs: round(Number.isFinite(eventLoopDelay.max) ? eventLoopDelay.max / 1e6 : 0),
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}
