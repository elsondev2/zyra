#!/usr/bin/env node
import assert from "node:assert/strict";
import { createZyraSession, describeRuntime, setCodexMode } from "../src/zyra-sdk.mjs";

const runtime = await createZyraSession({
  noSession: true,
  skipGuide: true,
  skipMemoryStartup: true,
  skipMemoryInjection: true,
  skipProfileInjection: true,
  skipProjectMemory: true,
});

try {
  const codexPayload = {
    model: "gpt-5.5",
    stream: true,
    include: ["reasoning.encrypted_content"],
    prompt_cache_key: "test-session",
  };

  assert.equal(describeRuntime(runtime).codexServiceTier, "normal");
  assert.equal((await runtime.session._extensionRunner.emitBeforeProviderRequest(codexPayload)).service_tier, undefined);

  assert.equal(setCodexMode(runtime, "fast"), "fast (priority)");
  assert.equal((await runtime.session._extensionRunner.emitBeforeProviderRequest(codexPayload)).service_tier, "priority");

  assert.equal(setCodexMode(runtime, "cheap"), "cheap (flex)");
  assert.equal((await runtime.session._extensionRunner.emitBeforeProviderRequest(codexPayload)).service_tier, "flex");

  assert.equal(setCodexMode(runtime, "auto"), "auto");
  assert.equal((await runtime.session._extensionRunner.emitBeforeProviderRequest(codexPayload)).service_tier, "auto");

  assert.equal(setCodexMode(runtime, "normal"), "normal");
  assert.equal((await runtime.session._extensionRunner.emitBeforeProviderRequest(codexPayload)).service_tier, undefined);

  setCodexMode(runtime, "fast");
  const nonCodexPayload = { model: "gpt-5.5", include: [] };
  assert.equal((await runtime.session._extensionRunner.emitBeforeProviderRequest(nonCodexPayload)).service_tier, undefined);

  assert.throws(() => setCodexMode(runtime, "warp"), /Mode must be one of/);

  console.log("zyra-codex-mode regression: ok");
} finally {
  runtime.session.dispose();
}
