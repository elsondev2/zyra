#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  readZyraMemoryModelPreference,
  resolveZyraMemoryModelSelection,
  saveZyraMemoryModelPreference,
} from "../src/memory/zyra-memory-model-preferences.mjs";

const root = mkdtempSync(path.join(os.tmpdir(), "zyra-memory-models-"));
const file = path.join(root, ".zyra", "memory-model-preferences.json");

try {
  assert.equal(readZyraMemoryModelPreference(file), "auto");
  assert.equal(await saveZyraMemoryModelPreference("openai/gpt-5.6-luna", file), "openai/gpt-5.6-luna");
  assert.equal(readZyraMemoryModelPreference(file), "openai/gpt-5.6-luna");
  await assert.rejects(saveZyraMemoryModelPreference("openai/ bad model", file), /Choose Automatic/);

  const openai = resolveZyraMemoryModelSelection({
    activeModel: { provider: "openai", id: "gpt-5.6-sol" },
    availableModels: [{ provider: "openai", id: "gpt-5.6-luna" }],
  });
  assert.deepEqual(openai, { model: "openai/gpt-5.6-luna", thinking: "medium", recommended: true });

  const codex = resolveZyraMemoryModelSelection({
    activeModel: { provider: "openai-codex", id: "gpt-5.6-sol" },
    availableModels: [{
      provider: "openai-codex",
      id: "gpt-5.6-luna",
      zyraCompatibility: { status: "transport-support-pending" },
    }],
  });
  assert.deepEqual(codex, { model: "openai-codex/gpt-5.6-sol", thinking: "medium", recommended: false });

  const anthropic = resolveZyraMemoryModelSelection({
    activeModel: { provider: "anthropic", id: "claude-opus-custom" },
    availableModels: [{ provider: "anthropic", id: "claude-sonnet-5" }],
  });
  assert.deepEqual(anthropic, { model: "anthropic/claude-sonnet-5", thinking: "low", recommended: true });

  const opencode = resolveZyraMemoryModelSelection({
    activeModel: { provider: "opencode", id: "some-paid-model" },
    availableModels: [{ provider: "opencode", id: "big-pickle" }],
  });
  assert.deepEqual(opencode, { model: "opencode/big-pickle", thinking: "medium", recommended: true });

  const harnessLuna = resolveZyraMemoryModelSelection({
    activeModel: { provider: "opencode-harness", id: "opencode/other-model" },
    availableModels: [
      { provider: "opencode-harness", id: "opencode/big-pickle", harness: { free: true } },
      { provider: "opencode-harness", id: "openai-codex/gpt-5.6-luna", harness: { variants: ["low", "medium", "high"] }, zyraCompatibility: { status: "transport-support-pending" } },
    ],
  });
  assert.deepEqual(harnessLuna, { model: "opencode-harness/openai-codex/gpt-5.6-luna", thinking: "medium", recommended: true });

  const harnessPickle = resolveZyraMemoryModelSelection({
    activeModel: { provider: "opencode-harness", id: "openai/another-model" },
    availableModels: [
      { provider: "opencode-harness", id: "opencode/big-pickle", harness: { free: true }, zyraCompatibility: { status: "transport-support-pending" } },
    ],
  });
  assert.deepEqual(harnessPickle, { model: "opencode-harness/opencode/big-pickle", thinking: "medium", recommended: true });

  const harnessUnknownPrice = resolveZyraMemoryModelSelection({
    activeModel: { provider: "opencode-harness", id: "opencode/active-model" },
    availableModels: [
      { provider: "opencode-harness", id: "opencode/big-pickle", harness: { free: false } },
    ],
  });
  assert.deepEqual(harnessUnknownPrice, { model: "opencode-harness/opencode/active-model", thinking: "medium", recommended: false });

  const custom = resolveZyraMemoryModelSelection({
    activeModel: { provider: "custom-local", id: "my-model" },
    availableModels: [],
  });
  assert.deepEqual(custom, { model: "custom-local/my-model", thinking: "medium", recommended: false });

  const pinned = resolveZyraMemoryModelSelection({
    preference: "custom-local/my-model",
    activeModel: { provider: "openai", id: "gpt-5.6-sol" },
  });
  assert.deepEqual(pinned, { model: "custom-local/my-model", thinking: undefined, recommended: false });

  console.log("Memory model preferences and provider defaults: ok");
} finally {
  rmSync(root, { recursive: true, force: true });
}
