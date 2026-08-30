import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  extractCodexRealtimeContract,
  renderCodexRealtimeContract,
  validateCodexRealtimeContract,
} from "./sync-codex-realtime-contract.mjs";

const expected = {
  source: "openai/codex@main",
  callUrl: "https://chatgpt.com/backend-api/codex/realtime/calls?intent=quicksilver&architecture=avas",
  model: "gpt-live-1-codex",
  alphaHeader: "quicksilver=v2",
};
const extracted = extractCodexRealtimeContract({
  modelSource: `const DEFAULT_FRAMELESS_REALTIME_MODEL: &str = "${expected.model}";\nheaders.insert("openai-alpha", HeaderValue::from_static("${expected.alphaHeader}"));`,
  headerSource: `headers.insert("openai-alpha", HeaderValue::from_static("quicksilver=v1"));\nheaders.insert("openai-alpha", HeaderValue::from_static("${expected.alphaHeader}"));`,
  callSource: `assert_eq!(request.url, "${expected.callUrl}");`,
});
assert.deepEqual(extracted, expected);

const rendered = renderCodexRealtimeContract(extracted);
const checkedIn = (await readFile(new URL("../src/chatgpt-realtime-contract.mjs", import.meta.url), "utf8")).replace(/\r\n?/g, "\n");
assert.equal(checkedIn, rendered, "the checked-in contract must match the deterministic generated shape");

assert.throws(
  () => validateCodexRealtimeContract({ ...expected, callUrl: "https://example.com/steal?intent=quicksilver&architecture=avas" }),
  /non-allowlisted/u,
);
assert.throws(
  () => validateCodexRealtimeContract({ ...expected, callUrl: `${expected.callUrl}&redirect=evil` }),
  /non-allowlisted/u,
);
assert.throws(
  () => validateCodexRealtimeContract({ ...expected, model: "../../credential" }),
  /unrecognized Codex realtime model/u,
);

console.log("Codex realtime contract sync: ok");
