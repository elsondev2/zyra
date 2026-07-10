#!/usr/bin/env node
import assert from "node:assert/strict";
import { createManagedBashState, createManagedBashTool } from "../src/managed-bash-tool.mjs";
import { createZyraSession } from "../src/zyra-sdk.mjs";

const state = createManagedBashState();
const tool = createManagedBashTool({ cwd: process.cwd(), state });

const short = await tool.execute("short", { command: "printf hello" }, new AbortController().signal);
assert.match(short.content[0].text, /hello/);

const liveUpdates = [];
const long = await tool.execute(
  "long",
  { command: "node -e \"console.log(1); setInterval(()=>console.log(Date.now()), 200)\"", wait: 0.5 },
  new AbortController().signal,
  (partial) => liveUpdates.push(partial),
);
assert.match(long.content[0].text, /Command still running/);
assert.equal(long.details.status, "running");
assert.ok(long.details.jobId);
await waitFor(() => liveUpdates.some((update) => update.details?.status === "running" && update.details?.live === true), 2000);
assert.ok(liveUpdates.some((update) => update.details?.status === "running" && update.details?.live === true), "managed bash should emit live output updates while the first command block is active");

const status = await tool.execute("status", { action: "status", jobId: long.details.jobId, wait: 0.2 }, new AbortController().signal);
assert.match(status.content[0].text, /Command still running|Command completed|Command exited|Command stopped/);

if (state.jobs.has(long.details.jobId)) {
  const stopped = await tool.execute("stop", { action: "stop", jobId: long.details.jobId }, new AbortController().signal);
  assert.match(stopped.content[0].text, /Command stopped|Command aborted/);
}

const runtime = await createZyraSession({
  noSession: true,
  skipGuide: true,
  skipMemoryStartup: true,
  skipMemoryInjection: true,
  skipProfileInjection: true,
  skipProjectMemory: true,
  managedBashAutoPollMs: 100,
});

try {
  const runtimeTool = runtime.session._toolRegistry.get("bash");
  const running = await runtimeTool.execute(
    "runtime-long",
    { command: "node -e \"setInterval(()=>console.log(Date.now()), 200)\"", wait: 0.05 },
    new AbortController().signal,
  );
  assert.equal(running.details.status, "running");
  await runtime.session.agent.prepareNextTurn?.({});
  const queued = runtime.session.agent.steeringQueue.drain();
  assert.equal(queued.length, 1);
  assert.equal(queued[0].role, "custom");
  assert.equal(queued[0].customType, "zyra.managed-bash.update.v1");
  assert.match(queued[0].content[0].text, /Zyra managed command update/);
} finally {
  runtime.managedBash?.abortAll?.();
  runtime.session.dispose();
}

console.log("zyra-managed-bash regression: ok");

async function waitFor(predicate, timeoutMs) {
  const startedAt = Date.now();
  while (!predicate() && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
