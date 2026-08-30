#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AgentBridgeWorker } from "../src/agent-server/bridge-worker.mjs";
import { createZyraPiRuntime } from "../src/pi-runtime.mjs";

const directory = await mkdtemp(path.join(os.tmpdir(), "zyra-pi-auth-sync-"));
const authPath = path.join(directory, "auth.json");
const options = {
  authPath,
  modelsPath: null,
  allowModelNetwork: false,
  refreshOnCreate: true,
};

try {
  const server = await createZyraPiRuntime(options);
  const client = await createZyraPiRuntime(options);
  assert.equal(server.authStorage.hasAuth("openai"), false);

  const apiKey = "sk-zyra-offline-auth-sync-fixture";
  await client.authStorage.loginApiKey("openai", apiKey);
  assert.equal(client.authStorage.hasAuth("openai"), true);
  assert.equal(server.authStorage.hasAuth("openai"), false, "an existing server snapshot stays stale until explicitly refreshed");

  const added = await server.modelRuntime.refresh({ allowNetwork: false, providers: ["openai"] });
  assert.equal(added.errors.size, 0);
  assert.equal(server.authStorage.hasAuth("openai"), true);
  assert.equal(await server.authStorage.getApiKey("openai"), apiKey);

  await client.authStorage.logout("openai");
  const removed = await server.modelRuntime.refresh({ allowNetwork: false, providers: ["openai"] });
  assert.equal(removed.errors.size, 0);
  assert.equal(server.authStorage.hasAuth("openai"), false);

  const previousPiDirectory = process.env.PI_CODING_AGENT_DIR;
  const previousStateDirectory = process.env.ZYRA_STATE_DIR;
  process.env.PI_CODING_AGENT_DIR = directory;
  process.env.ZYRA_STATE_DIR = path.join(directory, "state");
  const utilityWorker = new AgentBridgeWorker({ root: path.resolve(import.meta.dirname, ".."), cwd: directory });
  try {
    const warmup = await utilityWorker.request("warmup", { skipAvailability: true }, { timeoutMs: 60_000 });
    assert.ok(Array.isArray(warmup.models), "the real utility bridge starts without a connected chat runtime");
    await assert.rejects(
      utilityWorker.request("auth.refresh", { provider: "openai" }, { timeoutMs: 10_000 }),
      /Zyra bridge is not connected/,
      "utility bridges intentionally own no persistent auth snapshot",
    );
  } finally {
    utilityWorker.dispose();
    restoreEnvironment("PI_CODING_AGENT_DIR", previousPiDirectory);
    restoreEnvironment("ZYRA_STATE_DIR", previousStateDirectory);
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log("Pi shared auth refresh contract: ok");

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
