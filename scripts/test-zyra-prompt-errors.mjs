import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runZyraPrintPrompt, runZyraPrompt, setProfile } from "../src/zyra-sdk.mjs";

function createRuntime(finalMessage) {
  const entries = [];
  const session = {
    state: { messages: [] },
    agent: { state: { systemPrompt: "" } },
    sessionManager: {
      getEntries: () => entries,
      getSessionId: () => undefined,
      getSessionFile: () => undefined,
    },
    async prompt() {
      this.state.messages.push(finalMessage);
      entries.push({ type: "message", message: finalMessage });
    },
  };
  return { project: process.cwd(), session };
}

function createClientRuntime(project) {
  let systemPrompt = "";
  return {
    project,
    session: {
      state: { messages: [] },
      agent: {
        getSystemPrompt: () => systemPrompt,
        setSystemPrompt: (value) => { systemPrompt = String(value || ""); },
      },
      sessionManager: {
        getEntries: () => [],
        getSessionId: () => undefined,
        getSessionFile: () => undefined,
      },
    },
    get systemPrompt() { return systemPrompt; },
  };
}

const tempProject = mkdtempSync(path.join(os.tmpdir(), "zyra-client-runtime-"));
try {
  const clientRuntime = createClientRuntime(tempProject);
  assert.equal(setProfile(clientRuntime, "default"), "default");
  assert.match(clientRuntime.systemPrompt, /ZYRA_ACTIVE_PROFILE/);
} finally {
  rmSync(tempProject, { recursive: true, force: true });
}

const usageLimitMessage = {
  role: "assistant",
  content: [],
  stopReason: "error",
  errorMessage: "Codex error: The usage limit has been reached",
};

await assert.rejects(
  runZyraPrompt(createRuntime(usageLimitMessage), "hello"),
  /Codex error: The usage limit has been reached/,
);

await assert.rejects(
  runZyraPrompt(createRuntime({ role: "assistant", content: [], stopReason: "aborted" }), "hello"),
  /Request aborted/,
);

await assert.doesNotReject(
  runZyraPrompt(createRuntime({ role: "assistant", content: [{ type: "text", text: "ok" }], stopReason: "stop" }), "hello"),
);

assert.equal(
  await runZyraPrintPrompt(
    createRuntime({ role: "assistant", content: [{ type: "text", text: "print ok" }], stopReason: "stop" }),
    "hello",
  ),
  "print ok",
);

console.log("Zyra prompt error propagation checks passed.");
