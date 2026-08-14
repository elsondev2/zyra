import assert from "node:assert/strict";
import {
  CHATGPT_REALTIME_CALL_URL,
  CHATGPT_REALTIME_MODEL,
  buildChatGptRealtimeSession,
  createChatGptRealtimeCall,
  getChatGptAccountAuthStatus,
  parseChatGptRealtimeCallId,
} from "../src/chatgpt-account.mjs";

const offerSdp = "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";
const answerSdp = "v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";
const accessToken = "oauth-secret-token";
const accountId = "acct_test_123";
const input = {
  sdp: offerSdp,
  instructions: "Act as Zyra's concise voice collaborator.",
  voice: "cove",
  initialItems: [
    { role: "developer", text: "Project context" },
    { role: "user", text: "What changed?" },
    { role: "assistant", text: "I am checking." },
  ],
  sessionId: "voice_session_1",
  threadId: "voice_thread_1",
};

let capturedUrl;
let capturedInit;
const result = await createChatGptRealtimeCall(input, {
  resolveAuth: async () => ({ accessToken, accountId }),
  fetchImpl: async (url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return new Response(answerSdp, {
      status: 200,
      headers: {
        "content-type": "application/sdp",
        location: "https://chatgpt.com/backend-api/codex/realtime/calls/rtc_call_123?intent=quicksilver",
      },
    });
  },
});

assert.equal(capturedUrl, CHATGPT_REALTIME_CALL_URL);
assert.equal(capturedInit.method, "POST");
assert.equal(capturedInit.redirect, "error");
assert.equal(capturedInit.headers.Authorization, `Bearer ${accessToken}`);
assert.equal(capturedInit.headers["ChatGPT-Account-Id"], accountId);
assert.equal(capturedInit.headers["openai-alpha"], "quicksilver=v2");
assert.equal(capturedInit.headers.originator, "zyra_desktop");
assert.equal(capturedInit.headers["session-id"], input.sessionId);
assert.equal(capturedInit.headers["thread-id"], input.threadId);
assert.equal(capturedInit.headers["x-session-id"], input.sessionId);
assert.equal(capturedInit.signal instanceof AbortSignal, true);

const requestBody = JSON.parse(capturedInit.body);
assert.equal(requestBody.sdp, offerSdp);
assert.equal(requestBody.session.model, CHATGPT_REALTIME_MODEL);
assert.equal(requestBody.session.audio.output.voice, "cove");
assert.deepEqual(requestBody.session.delegation, { type: "client", ack_filler: false });
assert.deepEqual(requestBody.session.initial_items, [
  { type: "message", role: "developer", content: [{ type: "input_text", text: "Project context" }] },
  { type: "message", role: "user", content: [{ type: "input_text", text: "What changed?" }] },
  { type: "message", role: "assistant", content: [{ type: "output_text", text: "I am checking." }] },
]);
assert.doesNotMatch(capturedInit.body, /oauth-secret-token|acct_test_123/u);
assert.deepEqual(result, { sdp: answerSdp, callId: "rtc_call_123" });
assert.equal("accessToken" in result, false);

assert.equal(parseChatGptRealtimeCallId("/backend-api/codex/realtime/calls/rtc_safe-ID"), "rtc_safe-ID");
assert.equal(parseChatGptRealtimeCallId("/calls/123e4567-e89b-12d3-a456-426614174000"), "123e4567-e89b-12d3-a456-426614174000");
assert.throws(() => parseChatGptRealtimeCallId("/calls/not-a-call"), /invalid call location/u);
assert.throws(() => parseChatGptRealtimeCallId("/calls/rtc_ok\r\nx-leak: yes"), /valid call location/u);

assert.deepEqual(buildChatGptRealtimeSession({ instructions: "Voice", voice: "unknown" }), {
  model: CHATGPT_REALTIME_MODEL,
  instructions: "Voice",
  audio: { output: { voice: "cove" } },
  delegation: { type: "client", ack_filler: false },
});
assert.throws(
  () => buildChatGptRealtimeSession({ instructions: "Voice", initialItems: Array.from({ length: 129 }, () => ({ role: "user", text: "x" })) }),
  /at most 128 items/u,
);
assert.throws(
  () => buildChatGptRealtimeSession({ instructions: "Voice", initialItems: [{ role: "user", text: "x".repeat(32 * 1024 + 1) }] }),
  /32 KiB/u,
);

assert.deepEqual(
  await getChatGptAccountAuthStatus({ resolveAuth: async () => ({ accessToken, accountId }) }),
  { provider: "openai-codex", configured: true },
);
assert.deepEqual(
  await getChatGptAccountAuthStatus({ resolveAuth: async () => undefined }),
  { provider: "openai-codex", configured: false },
);

let unauthenticatedFetchCalled = false;
await assert.rejects(
  createChatGptRealtimeCall(input, {
    resolveAuth: async () => undefined,
    fetchImpl: async () => {
      unauthenticatedFetchCalled = true;
      throw new Error("must not run");
    },
  }),
  /Connect your ChatGPT account/u,
);
assert.equal(unauthenticatedFetchCalled, false);

await assert.rejects(
  createChatGptRealtimeCall(input, {
    resolveAuth: async () => { throw new Error(`credential loader leaked ${accessToken}`); },
    fetchImpl: async () => { throw new Error("must not run"); },
  }),
  (error) => {
    assert.match(error.message, /Connect your ChatGPT account/u);
    assert.doesNotMatch(error.message, /oauth-secret-token/u);
    return true;
  },
);

await assert.rejects(
  createChatGptRealtimeCall(input, {
    resolveAuth: async () => ({ accessToken, accountId }),
    fetchImpl: async () => { throw new Error(`transport leaked ${accessToken}`); },
  }),
  (error) => {
    assert.equal(error.message, "ChatGPT Voice signaling failed.");
    assert.doesNotMatch(error.message, /oauth-secret-token/u);
    return true;
  },
);

await assert.rejects(
  createChatGptRealtimeCall(input, {
    resolveAuth: async () => ({ accessToken, accountId: "bad\r\nheader" }),
    fetchImpl: async () => { throw new Error("must not run"); },
  }),
  /account id is invalid/u,
);

await assert.rejects(
  createChatGptRealtimeCall(input, {
    resolveAuth: async () => ({ accessToken, accountId }),
    fetchImpl: async () => new Response("provider body must remain hidden", { status: 401 }),
  }),
  (error) => {
    assert.match(error.message, /authentication expired/u);
    assert.doesNotMatch(error.message, /provider body|oauth-secret-token/u);
    return true;
  },
);

await assert.rejects(
  createChatGptRealtimeCall(input, {
    resolveAuth: async () => ({ accessToken, accountId }),
    fetchImpl: async () => new Response(answerSdp, {
      status: 200,
      headers: {
        "content-length": String(512 * 1024 + 1),
        location: "/calls/rtc_too_large",
      },
    }),
  }),
  /oversized signaling response/u,
);

let fetchAfterHangingAuth = false;
await assert.rejects(
  createChatGptRealtimeCall({ ...input, timeoutMs: 5 }, {
    resolveAuth: async () => new Promise(() => undefined),
    setTimeoutImpl: (callback) => {
      queueMicrotask(callback);
      return 1;
    },
    clearTimeoutImpl: () => undefined,
    fetchImpl: async () => {
      fetchAfterHangingAuth = true;
      throw new Error("must not run");
    },
  }),
  /signaling timed out/u,
);
assert.equal(fetchAfterHangingAuth, false, "auth resolution must share the bounded signaling deadline");

await assert.rejects(
  createChatGptRealtimeCall({ ...input, timeoutMs: 5 }, {
    resolveAuth: async () => ({ accessToken, accountId }),
    setTimeoutImpl: (callback) => {
      queueMicrotask(callback);
      return 1;
    },
    clearTimeoutImpl: () => undefined,
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }),
  }),
  /signaling timed out/u,
);

const callerAbort = new AbortController();
const cancelledCall = createChatGptRealtimeCall({ ...input, signal: callerAbort.signal }, {
  resolveAuth: async () => ({ accessToken, accountId }),
  fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
    if (init.signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  }),
});
callerAbort.abort();
await assert.rejects(cancelledCall, /signaling was cancelled/u);

console.log("ChatGPT realtime direct-call contract: ok");
