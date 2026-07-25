import { randomUUID } from "node:crypto";
import path from "node:path";
import readline from "node:readline";
import { pathToFileURL } from "node:url";
import { normalizeAgentSurfaceTool } from "./agent-surface.mjs";
import { AgentControlBridgeClient } from "./agent-control/bridge-client.mjs";

const root = path.resolve(process.env.ZYRA_ROOT ?? path.resolve(import.meta.dirname, ".."));
const sdkPath = path.join(root, "src", "zyra-sdk.mjs");

let sdkPromise;
let runtime;
let unsubscribe;
let unsubscribeManagedBash;
const controlBridgeClient = new AgentControlBridgeClient({ send: (message) => send(message) });

function stringifyProtocol(value) {
  return JSON.stringify(value);
}

function send(message) {
  process.stdout.write(`${stringifyProtocol(message)}\n`);
}

function sendResponse(id, ok, payload = {}) {
  send({ type: "response", id, ok, ...payload });
}

function modelToInfo(model, sdk) {
  return {
    id: `${model.provider}/${model.id}`,
    label: model.id,
    description: model.name && model.name !== model.id ? model.name : model.provider,
    supportedEfforts: sdk.getZyraModelThinkingLevels(model),
  };
}

async function loadSdk() {
  if (!sdkPromise) {
    sdkPromise = import(pathToFileURL(sdkPath).href);
  }
  return sdkPromise;
}

function disposeRuntime() {
  if (typeof unsubscribe === "function") {
    unsubscribe();
  }
  unsubscribe = undefined;
  if (typeof unsubscribeManagedBash === "function") {
    unsubscribeManagedBash();
  }
  unsubscribeManagedBash = undefined;
  runtime?.managedBash?.abortAll?.("Zyra bridge disposed");
  runtime?.session?.dispose?.();
  runtime = undefined;
}

function isMissingLocalChatError(error) {
  return error instanceof Error && /No local chat matches:/i.test(error.message);
}

async function handleConnect(payload) {
  disposeRuntime();
  const sdk = await loadSdk();
  const requestedThreadId = payload.threadId || payload.providerThreadId || undefined;
  const createRuntime = (overrides = {}) => sdk.createZyraSession({
    project: payload.cwd,
    session: requestedThreadId,
    noSession: Boolean(payload.noSession),
    model: payload.model,
    profile: payload.profile,
    thinking: payload.thinking ?? "medium",
    surface: "desktop-ui",
    skipMemoryStartup: true,
    skipModelAvailability: true,
    controlBridgeClient,
    ...overrides,
  });
  try {
    runtime = await createRuntime();
  } catch (error) {
    if (!requestedThreadId || !isMissingLocalChatError(error)) {
      throw error;
    }
    runtime = await createRuntime({ session: undefined, noSession: Boolean(payload.noSession) });
  }
  unsubscribe = runtime.session.subscribe((event) => {
    const normalized = normalizeEvent(event);
    if (normalized) send({ type: "event", event: normalized });
  });
  unsubscribeManagedBash = runtime.managedBash?.subscribe?.((update) => {
    const payload = cloneJsonValue(update);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
    send({ type: "event", event: { type: "managed_bash_job_update", ...payload } });
  });
  const described = sdk.describeRuntime(runtime);
  const threadId = String(
    runtime.session.sessionManager?.getSessionId?.()
      || described.threadId
      || described.sessionId
      || requestedThreadId
      || randomUUID()
  );
  return {
    threadId,
    providerThreadId: threadId,
    model: String(described.model || payload.model || "openai-codex/gpt-5.6-sol"),
    profile: String(described.profile || payload.profile || "default"),
  };
}

function normalizeEvent(event) {
  if (!event || typeof event !== "object") return null;
  const type = typeof event.type === "string" ? event.type : null;
  if (!type) return null;

  if (type === "message_update" || type === "message_end" || type === "message_start") {
    return {
      type,
      message: normalizeMessage(event.message),
      assistantMessageEvent: normalizeAssistantMessageEvent(event.assistantMessageEvent),
    };
  }

  if (type === "tool_execution_start" || type === "tool_execution_update" || type === "tool_execution_end") {
    const normalized = {
      type,
      id: stringValue(event.id),
      toolCallId: stringValue(event.toolCallId),
      toolName: stringValue(event.toolName) || stringValue(event.name),
      name: stringValue(event.name),
      args: cloneJsonValue(event.args ?? event.arguments),
      arguments: cloneJsonValue(event.arguments),
      input: cloneJsonValue(event.input),
      result: cloneJsonValue(event.result),
      partialResult: cloneJsonValue(event.partialResult),
      output: cloneJsonValue(event.output),
      metadata: cloneJsonValue(event.metadata),
      startedAt: cloneJsonValue(event.startedAt ?? event.started_at),
      endedAt: cloneJsonValue(event.endedAt ?? event.ended_at ?? event.completedAt ?? event.completed_at),
      isError: Boolean(event.isError),
    };
    return { ...normalized, surface: normalizeAgentSurfaceTool(normalized) };
  }

  if (type === "auto_retry_start") {
    return {
      type,
      attempt: numberValue(event.attempt),
      maxAttempts: numberValue(event.maxAttempts),
      errorMessage: stringValue(event.errorMessage),
    };
  }

  if (type === "compaction_start") {
    return {
      type,
      reason: stringValue(event.reason),
    };
  }

  if (type === "compaction_end") {
    const result = event.result && typeof event.result === "object" && !Array.isArray(event.result)
      ? {
          firstKeptEntryId: stringValue(event.result.firstKeptEntryId),
          tokensBefore: numberValue(event.result.tokensBefore),
          estimatedTokensAfter: numberValue(event.result.estimatedTokensAfter),
        }
      : undefined;
    return {
      type,
      reason: stringValue(event.reason),
      result,
      aborted: Boolean(event.aborted),
      willRetry: Boolean(event.willRetry),
      errorMessage: stringValue(event.errorMessage),
    };
  }

  return { type };
}

function normalizeMessage(message) {
  if (!message || typeof message !== "object") return null;
  return {
    id: stringValue(message.id) || stringValue(message.messageId) || stringValue(message.entryId) || stringValue(message.uuid),
    role: stringValue(message.role),
    content: normalizeContent(message.content),
    usage: normalizeUsage(message.usage),
    stopReason: stringValue(message.stopReason),
    errorMessage: stringValue(message.errorMessage),
  };
}

function normalizeAssistantMessageEvent(event) {
  if (!event || typeof event !== "object") return undefined;
  const normalized = {};
  const type = stringValue(event.type);
  if (type) normalized.type = type;
  const id = stringValue(event.id) || stringValue(event.itemId) || stringValue(event.messageId);
  if (id) normalized.id = id;
  const channel = stringValue(event.channel);
  if (channel) normalized.channel = channel;
  const kind = stringValue(event.kind);
  if (kind) normalized.kind = kind;
  const delta = stringValue(event.delta);
  if (delta) normalized.delta = delta;
  const partial = event.partial && typeof event.partial === "object" ? event.partial : undefined;
  if (partial) {
    normalized.partial = {
      ...cloneJsonValue(partial),
      content: normalizeContent(partial.content),
    };
  }
  const content = normalizeContent(event.content);
  if (typeof content === "string" ? content : content.length > 0) {
    normalized.content = content;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return [];
  return content.flatMap((part) => {
    if (!part || typeof part !== "object") return [];
    if (part.type === "text") {
      return [{ type: "text", text: stringValue(part.text) || "" }];
    }
    if (part.type === "thinking") {
      return [{ type: "thinking", thinking: stringValue(part.thinking) || stringValue(part.text) || "" }];
    }
    return [];
  });
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object") return undefined;
  return {
    input: numberValue(usage.input),
    output: numberValue(usage.output),
    cacheRead: numberValue(usage.cacheRead),
    reasoning: numberValue(usage.reasoning ?? usage.reasoningTokens),
    total: numberValue(usage.total),
  };
}

function cloneJsonValue(value) {
  if (value === undefined || typeof value === "function") return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function stringValue(value) {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

const supportedPromptImageMimeTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const maxPromptImageBase64Chars = 28 * 1024 * 1024;

function normalizePromptImages(value) {
  if (value == null) return undefined;
  if (!Array.isArray(value)) throw new Error("Invalid prompt image payload.");
  if (value.length > 12) throw new Error("Attach at most 12 images per message.");

  const images = value.map((image, index) => {
    if (!image || typeof image !== "object") throw new Error(`Image ${index + 1} is invalid.`);
    const data = stringValue(image.data);
    const mimeType = stringValue(image.mimeType)?.toLowerCase();
    if (image.type !== "image" || !data || !mimeType || !supportedPromptImageMimeTypes.has(mimeType)) {
      throw new Error(`Image ${index + 1} is not a supported visual input.`);
    }
    if (data.length > maxPromptImageBase64Chars) throw new Error(`Image ${index + 1} is larger than 20 MB.`);
    return { type: "image", data, mimeType };
  });

  return images.length > 0 ? images : undefined;
}

async function handlePrompt(payload) {
  if (!runtime) {
    throw new Error("Zyra bridge is not connected.");
  }
  const sdk = await loadSdk();
  if (payload.model) {
    await sdk.setModel(runtime, payload.model);
  }
  if (payload.thinking) {
    sdk.setThinking(runtime, payload.thinking);
  }
  if (payload.profile) {
    await sdk.setProfile(runtime, payload.profile);
  }
  const images = normalizePromptImages(payload.images);
  await sdk.runZyraPrompt(runtime, payload.prompt, { images });
  return {};
}

async function handleGenerateText(payload) {
  const prompt = String(payload.prompt || '').trim();
  if (!prompt) throw new Error('Prompt is required.');

  const sdk = await loadSdk();
  const titleRuntime = await sdk.createZyraSession({
    project: payload.cwd,
    noSession: true,
    model: payload.model,
    thinking: payload.thinking || 'low',
    skipGuide: true,
    skipMemoryStartup: true,
    skipMemoryInjection: true,
    skipProfileInjection: true,
    skipProjectMemory: true,
    skipModelAvailability: true,
    persistStartupPreferences: false,
  });
  try {
    const text = await sdk.runZyraBackgroundTextPrompt(titleRuntime, prompt);
    const described = sdk.describeRuntime(titleRuntime);
    return { text, model: described.model };
  } finally {
    titleRuntime.session.dispose();
  }
}

async function handleModels(payload) {
  const sdk = await loadSdk();
  if (runtime?.session?.modelRegistry) {
    if (payload.forceRefresh && typeof runtime.session.modelRegistry.refresh === "function") {
      runtime.session.modelRegistry.refresh();
    }
    return {
      models: sdk.getZyraAvailableModels(runtime.session.modelRegistry).map((model) => modelToInfo(model, sdk)),
    };
  }
  return {
    models: await sdk.listAvailableModels({ forceRefresh: Boolean(payload.forceRefresh) }),
  };
}

async function handleWarmup(payload) {
  const sdk = await loadSdk();
  return sdk.warmupZyraRuntime({ forceRefresh: Boolean(payload.forceRefresh) });
}

async function handleAbort() {
  await runtime?.session?.abort?.();
  return {};
}

async function handleMessage(message) {
  if (message?.type === "control.response") {
    controlBridgeClient.handleResponse(message);
    return;
  }
  const id = message?.id;
  try {
    if (message?.type === "connect") {
      sendResponse(id, true, { result: await handleConnect(message.payload ?? {}) });
      return;
    }
    if (message?.type === "prompt") {
      sendResponse(id, true, { result: await handlePrompt(message.payload ?? {}) });
      return;
    }
    if (message?.type === "generate_text") {
      sendResponse(id, true, { result: await handleGenerateText(message.payload ?? {}) });
      return;
    }
    if (message?.type === "models") {
      sendResponse(id, true, { result: await handleModels(message.payload ?? {}) });
      return;
    }
    if (message?.type === "warmup") {
      sendResponse(id, true, { result: await handleWarmup(message.payload ?? {}) });
      return;
    }
    if (message?.type === "abort") {
      sendResponse(id, true, { result: await handleAbort() });
      return;
    }
    if (message?.type === "dispose") {
      controlBridgeClient.dispose();
      disposeRuntime();
      sendResponse(id, true, { result: {} });
      process.exit(0);
    }
    throw new Error(`Unknown bridge message: ${message?.type ?? "missing"}`);
  } catch (error) {
    sendResponse(id, false, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  try {
    void handleMessage(JSON.parse(line));
  } catch (error) {
    send({
      type: "protocol_error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

process.on("SIGTERM", () => {
  controlBridgeClient.dispose();
  disposeRuntime();
  process.exit(0);
});

process.on("SIGINT", () => {
  controlBridgeClient.dispose();
  disposeRuntime();
  process.exit(0);
});
