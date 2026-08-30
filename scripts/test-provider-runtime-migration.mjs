import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const desktopSourceRoot = join(root, "desktop", "src");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:c|m)?(?:j|t)sx?$/u.test(entry.name) ? [path] : [];
  });
}

const retiredDesktopModules = [
  "desktop/src/main/assistant/codex-app-server.ts",
  "desktop/src/main/assistant/codex-app-server-support.ts",
  "desktop/src/main/assistant/codex-app-server-runtime-helpers.ts",
];
for (const path of retiredDesktopModules) {
  assert.equal(existsSync(join(root, path)), false, `${path} must stay retired`);
}

for (const path of sourceFiles(desktopSourceRoot)) {
  const source = readFileSync(path, "utf8");
  const label = relative(root, path);
  assert.doesNotMatch(source, /(?:codex\.cmd|codex\.exe|CODEX_HOME|[\\/]\.codex[\\/]|["']\.codex["']|auth\.json|app-server)/iu, `${label} must not depend on a Codex executable, app-server, or auth file`);
  if (basename(path).toLowerCase().includes("codex")) {
    assert.doesNotMatch(source, /node:child_process|\b(?:spawn|spawnSync|execFile)\s*\(/u, `${label} must not retain a Codex process boundary`);
  }
}

assert.equal(existsSync(join(root, "desktop/src/main/ai/codex.ts")), false, "the retired Git Codex module name must stay removed");
const gitProvider = read("desktop/src/main/ai/chatgpt.ts");
assert.doesNotMatch(gitProvider, /node:child_process|\b(?:spawn|execFile|exec)\s*\(/u, "Git ChatGPT text must not launch a CLI");
assert.match(gitProvider, /getAssistantService\(\)\.generateUtilityText\(/u, "Git ChatGPT text must use AssistantService utility generation");

const voiceRuntime = read("desktop/src/main/assistant/codex-realtime-voice.ts");
assert.doesNotMatch(voiceRuntime, /node:child_process|\b(?:spawn|execFile|exec)\s*\(/u, "Voice signaling must not launch a CLI");
assert.match(voiceRuntime, /createChatGptRealtimeCall/u, "Voice must use direct ChatGPT signaling");
assert.match(voiceRuntime, /emitClientMessages/u, "main-process Voice actions must be projected to the browser owner");

const capabilityProbe = read("desktop/src/main/assistant/voice/codex-realtime-capability-probe.ts");
assert.doesNotMatch(capabilityProbe, /node:child_process|\b(?:spawn|execFile|exec)\s*\(/u, "Voice capability discovery must be source-controlled");
assert.match(capabilityProbe, /createChatGptRealtimeCapabilityReport/u, "Voice capability discovery must use the deterministic manifest");

const accountBoundary = read("src/chatgpt-account.mjs");
const realtimeContract = read("src/chatgpt-realtime-contract.mjs");
assert.match(realtimeContract, /backend-api\/codex\/realtime\/calls\?intent=quicksilver&architecture=avas/u);
assert.match(realtimeContract, /gpt-live-1-codex/u);
assert.match(realtimeContract, /quicksilver=v2/u);
assert.match(accountBoundary, /"openai-alpha": CHATGPT_REALTIME_ALPHA_HEADER/u);
assert.match(accountBoundary, /"ChatGPT-Account-Id"/u);
assert.match(accountBoundary, /\{ sdp, session \}/u);
assert.doesNotMatch(accountBoundary, /node:child_process|\b(?:spawn|execFile)\s*\(/u, "ChatGPT account calls must remain direct HTTP requests");

const utilityBridge = read("src/zyra-ui-bridge.mjs");
assert.match(utilityBridge, /handleGenerateText[\s\S]*?noSession: true,[\s\S]*?noTools: ["']all["'],/u, "utility text generation must be ephemeral and tool-free");
assert.match(utilityBridge, /buildCompletedTitleTranscript\(targetRuntime\.session\.state\?\.messages\)/u, "TUI titles use the completed canonical user/final-assistant turn");
assert.match(utilityBridge, /runtime !== targetRuntime/u, "a delayed TUI title cannot overwrite a different Desktop-selected chat");
const sdkRuntime = read("src/zyra-sdk.mjs");
assert.match(sdkRuntime, /removeZyraTitleGenerationMessages\(contextMessages\)/u, "legacy title utility turns are removed from resumed model context");

const sharedPiRuntime = read("src/pi-runtime.mjs");
assert.match(
  sharedPiRuntime,
  /options\.refreshOnCreate !== undefined[\s\S]*?refreshOnCreate: options\.refreshOnCreate === true/u,
  "Pi model discovery must keep its enabled-by-default startup refresh unless a caller explicitly overrides it",
);

const tuiApp = read("src/zyra-app.mjs");
assert.match(tuiApp, /activeRun \|\| runtime\.session\.isStreaming/u, "resumed TUI input follows a canonical turn that another surface already owns");

const piRuntime = read("desktop/src/main/assistant/zyra-pi-runtime.ts");
assert.match(piRuntime, /async generateText\(/u, "Pi runtime must expose utility text generation");
assert.match(piRuntime, /this\.bridgePath/u, "the only child process in the Pi runtime must remain the Zyra bridge worker");

console.log("provider runtime source contract: ok");
