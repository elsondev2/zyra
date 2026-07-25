import assert from "node:assert/strict";
import { runZyraPrintPrompt, runZyraPrompt } from "../src/zyra-sdk.mjs";

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
