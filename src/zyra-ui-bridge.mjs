import { randomUUID } from "node:crypto";
import path from "node:path";
import readline from "node:readline";
import { pathToFileURL } from "node:url";
import { normalizeAgentSurfaceTool } from "./agent-surface.mjs";
import { AgentControlBridgeClient } from "./agent-control/bridge-client.mjs";
import { startTemporaryBrowserRelay } from "./agent-control/temporary-browser-relay.mjs";

const root = path.resolve(process.env.ZYRA_ROOT ?? path.resolve(import.meta.dirname, ".."));
const sdkPath = path.join(root, "src", "zyra-sdk.mjs");

let sdkPromise;
let runtime;
let unsubscribe;
let unsubscribeManagedBash;
let unsubscribeFleet;
let temporaryBrowserRelay;
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

function stopTemporaryBrowserRelay() {
  temporaryBrowserRelay?.stop();
  temporaryBrowserRelay = undefined;
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
  stopTemporaryBrowserRelay();
  if (typeof unsubscribe === "function") {
    unsubscribe();
  }
  unsubscribe = undefined;
  if (typeof unsubscribeManagedBash === "function") {
    unsubscribeManagedBash();
  }
  unsubscribeManagedBash = undefined;
  if (typeof unsubscribeFleet === "function") {
    unsubscribeFleet();
  }
  unsubscribeFleet = undefined;
  runtime?.managedBash?.abortAll?.("Zyra bridge disposed");
  void runtime?.fleet?.cancelAll?.("Zyra bridge disposed");
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
    surface: payload.surface === "memory-worker" ? "memory-worker" : "agent-server",
    skipMemoryStartup: true,
    skipModelAvailability: true,
    rootThreadId: payload.localThreadId || undefined,
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
  unsubscribeFleet = runtime.fleet?.subscribe?.(({ event, snapshot }) => {
    send({ type: "event", event: { ...summarizeFleetEvent(event), fleet: projectFleetSnapshot(snapshot) } });
  });
  try {
    temporaryBrowserRelay = await startTemporaryBrowserRelay({
      controlClient: controlBridgeClient,
      threadId: payload.localThreadId
    });
  } catch (error) {
    process.stderr.write(`[temporary-browser-relay] ${error instanceof Error ? error.message : String(error)}\n`);
  }
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
    fleet: projectFleetSnapshot(runtime.fleet?.snapshot?.()),
    agentDefinitions: cloneJsonValue(runtime.fleet?.listDefinitions?.()),
    workflowDefinitions: cloneJsonValue(runtime.workflows?.listDefinitions?.()),
    sessionFile: runtime.session.sessionManager?.getSessionFile?.() || undefined,
    sessionName: runtime.session.sessionManager?.getSessionName?.() || undefined,
    cwd: runtime.session.sessionManager?.getCwd?.() || payload.cwd,
    messages: Array.isArray(runtime.session.state?.messages)
      ? runtime.session.state.messages.slice(-500).map(normalizeMessage).filter(Boolean)
      : [],
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

  if (type === "session_title") {
    return { type, title: stringValue(event.title) };
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
    if (part.type === "image") {
      return [{
        type: "image",
        data: stringValue(part.data),
        mimeType: stringValue(part.mimeType) || stringValue(part.mime_type) || "image/png"
      }];
    }
    if (part.type === "toolCall") {
      return [{
        type: "toolCall",
        id: stringValue(part.id),
        name: stringValue(part.name),
        arguments: cloneJsonValue(part.arguments)
      }];
    }
    return [cloneJsonValue(part)];
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
  const shouldGenerateTitle = !runtime.session.sessionManager?.getSessionName?.();
  if (payload.model) {
    await sdk.setModel(runtime, payload.model);
  }
  if (payload.thinking) {
    sdk.setThinking(runtime, payload.thinking);
  }
  if (payload.profile) {
    await sdk.setProfile(runtime, payload.profile);
  }
  if (typeof payload.webSearch === "boolean" || typeof payload.webFetch === "boolean") {
    sdk.setWebTools(runtime, {
      webSearch: typeof payload.webSearch === "boolean" ? payload.webSearch : runtime.webSearch,
      webFetch: typeof payload.webFetch === "boolean" ? payload.webFetch : runtime.webFetch,
    });
  }
  const images = normalizePromptImages(payload.images);
  await sdk.runZyraPrompt(runtime, payload.prompt, { images });
  if (shouldGenerateTitle) {
    void generateAndPersistSessionTitle(String(payload.prompt || ""), payload.cwd || runtime.project).catch((error) => {
      process.stderr.write(`[session-title] ${error instanceof Error ? error.message : String(error)}\n`);
    });
  }
  return {};
}

async function generateAndPersistSessionTitle(prompt, cwd) {
  if (!runtime?.session?.sessionManager?.appendSessionInfo) return;
  if (runtime.session.sessionManager.getSessionName?.()) return;
  const seed = String(prompt || "").replace(/\s+/g, " ").trim().slice(0, 720);
  if (!seed) return;
  const result = await handleGenerateText({
    cwd: cwd || runtime.project,
    model: "openai-codex/gpt-5.4-mini",
    thinking: "low",
    prompt: [
      "Write a concise title for this coding-assistant chat.",
      "Return title text only, without quotes or markdown. Maximum 60 characters.",
      "Prefer the concrete task or topic over greetings.",
      "",
      seed
    ].join("\n")
  });
  const title = String(result.text || "")
    .replace(/^title\s*:\s*/i, "")
    .replace(/^[\"'`]+|[\"'`]+$/g, "")
    .split(/\r?\n/)[0]
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  if (!title) return;
  runtime.session.sessionManager.appendSessionInfo(title);
  send({ type: "event", event: { type: "session_title", title } });
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
    enableFleet: false,
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
  await Promise.allSettled([
    runtime?.fleet?.cancelAll?.("root turn aborted"),
    runtime?.session?.abort?.(),
  ]);
  return {};
}

async function handleSessionOperation(type, payload = {}) {
  if (!runtime?.session) throw new Error("Zyra bridge is not connected.");
  if (type === "steer") {
    await runtime.session.steer(String(payload.prompt || ""), payload.images);
    return {};
  }
  if (type === "follow_up") {
    await runtime.session.followUp(String(payload.prompt || ""), payload.images);
    return {};
  }
  if (type === "compact") return runtime.session.compact(String(payload.instructions || "").trim() || undefined);
  if (type === "clear_queue") {
    runtime.session.clearQueue?.();
    return {};
  }
  if (type === "reload") {
    const sdk = await loadSdk();
    return sdk.reloadZyraRuntime(runtime);
  }
  throw new Error(`Unknown session operation: ${type}.`);
}

async function handleFleetOperation(type, payload = {}) {
  if (!runtime?.fleet || !runtime?.workflows) throw new Error("Fleet runtime is not connected.");
  const agents = runtime.fleet;
  const workflows = runtime.workflows;
  switch (type) {
    case "agents.list": return { definitions: agents.listDefinitions(), runs: Object.values(agents.snapshot()?.agents ?? {}), snapshot: projectFleetSnapshot(agents.snapshot()) };
    case "agents.listDefinitions": return agents.listDefinitions();
    case "agents.listRuns": return { runs: Object.values(agents.snapshot()?.agents ?? {}) };
    case "agents.get":
    case "agents.status": return agents.status(payload.agentRunId);
    case "agents.wait": return agents.wait(payload.agentRunId, payload);
    case "agents.spawn": return agents.spawn({ ...payload, goal: payload.goal ?? payload.prompt });
    case "agents.send": return agents.send(payload.agentRunId, payload.message ?? payload.prompt);
    case "agents.stop": return agents.stop(payload.agentRunId, payload.reason);
    case "agents.retry": return agents.retry(payload.agentRunId, payload.overrides ?? {});
    case "agents.resume": return agents.resume(payload.agentRunId, payload.message);
    case "agents.transcript":
    case "agents.getTranscript": return agents.getTranscript(payload.agentRunId, payload);
    case "workflows.list": return { definitions: workflows.listDefinitions(), runs: workflows.listRuns(), snapshot: projectFleetSnapshot(agents.snapshot()) };
    case "workflows.listDefinitions": return workflows.listDefinitions();
    case "workflows.listRuns": return { runs: workflows.listRuns() };
    case "workflows.status": return workflows.status(payload.workflowRunId);
    case "workflows.run": return workflows.run(payload.name, payload.args ?? {}, { approved: payload.approved === true, background: payload.background !== false });
    case "workflows.pause": return workflows.pause(payload.workflowRunId);
    case "workflows.resume": return workflows.resume(payload.workflowRunId);
    case "workflows.stop": return workflows.stop(payload.workflowRunId, payload.reason);
    case "workflows.restart": return workflows.restart(payload.workflowRunId, { args: payload.args });
    case "workflows.save": return workflows.save(payload.workflowRunId, payload);
    case "workflows.getScript": return { source: workflows.getScript(payload.workflowRunId) };
    default: throw new Error(`Unknown fleet operation: ${type}.`);
  }
}

function projectFleetSnapshot(snapshot) {
  if (!snapshot) return null;
  const allAgents = Object.values(snapshot.agents ?? {});
  const allWorkflows = Object.values(snapshot.workflows ?? {});
  const selectedAgents = allAgents.slice(-200);
  const selectedWorkflows = allWorkflows.slice(-100);
  const summarizeAgent = (run) => ({
    version: run.version, rootSessionId: snapshot.rootSessionId,
    agentRunId: run.agentRunId, agentId: run.agentId, definitionName: run.definitionName, label: run.label,
    parentAgentRunId: run.parentAgentRunId, workflowRunId: run.workflowRunId, workflowPhaseId: run.phaseId, workflowCallId: null,
    goal: String(run.goal ?? "").slice(0, 1000), status: run.status, depth: run.depth, contextFork: run.contextFork,
    attempt: run.attempt, maxAttempts: 1, requestedModel: run.requestedModel, selectedModel: run.selectedModel, modelRoute: run.modelRoute,
    effort: run.effort, requestedTools: run.tools, grantedTools: run.tools, deniedTools: [], deniedCapabilities: [],
    controlLease: run.controlLease ?? null,
    permissionMode: run.permissionMode, isolation: run.isolation, readScope: run.readScope, writeScope: run.writeScope,
    worktree: run.worktree, providerSessionId: run.providerSessionId, sessionFile: run.sessionFile,
    createdAt: run.createdAt, queuedAt: run.createdAt, startedAt: run.startedAt, completedAt: run.completedAt, heartbeatAt: run.heartbeatAt,
    elapsedMs: run.elapsedMs, activity: run.activity, usage: run.usage,
    result: run.result ? { text: String(run.result.text ?? "").slice(0, 4000), warnings: run.result.warnings, truncated: run.result.truncated } : null,
    error: run.error,
  });
  const summarizeWorkflow = (run) => ({
    version: run.version, rootSessionId: snapshot.rootSessionId,
    workflowRunId: run.workflowRunId, definitionName: run.definitionName, definitionPath: run.source, definitionHash: run.scriptHash,
    status: run.status, attempt: run.attempt, args: run.args,
    phases: Object.fromEntries(Object.entries(run.phases ?? {}).map(([phaseId, phase]) => [phaseId, { name: phaseId, ...phase, phaseId }])),
    calls: Object.fromEntries(Object.entries(run.calls ?? {}).slice(-200)), agentRunIds: run.agentRunIds,
    usage: run.usage, projected: run.projected, budget: run.budget, cacheHits: run.cacheHits, warnings: run.warnings,
    approvedAt: run.approval?.approved ? run.createdAt : null,
    createdAt: run.createdAt, startedAt: run.startedAt, completedAt: run.completedAt,
    result: run.result === undefined ? null : cloneJsonValue(run.result), error: run.error,
  });
  const agents = Object.fromEntries(selectedAgents.map((run) => [run.agentRunId, summarizeAgent(run)]));
  const workflows = Object.fromEntries(selectedWorkflows.map((run) => [run.workflowRunId, summarizeWorkflow(run)]));
  const relationships = selectedAgents.map((run) => ({
    parentAgentRunId: run.parentAgentRunId ?? null, childAgentRunId: run.agentRunId,
    workflowRunId: run.workflowRunId ?? null, workflowPhaseId: run.phaseId ?? null,
  })).slice(-400);
  const artifacts = selectedAgents.flatMap((run) => (run.artifacts ?? []).map((artifact, index) => ({
    artifactId: String(artifact.artifactId ?? `${run.agentRunId}:${index}`), agentRunId: run.agentRunId,
    workflowRunId: run.workflowRunId ?? null, kind: String(artifact.kind ?? "artifact"), path: artifact.path ?? null,
    createdAt: run.completedAt ?? run.startedAt ?? run.createdAt,
  }))).slice(-400);
  return {
    version: snapshot.version, fleetId: snapshot.fleetId, rootSessionId: snapshot.rootSessionId,
    rootThreadId: snapshot.rootThreadId, lastAppliedSequence: snapshot.lastAppliedSequence,
    agents, workflows, relationships, artifacts, eventWindow: [], usage: snapshot.usage, updatedAt: snapshot.updatedAt,
    truncated: { agents: allAgents.length > selectedAgents.length, workflows: allWorkflows.length > selectedWorkflows.length, relationships: false, artifacts: false, events: false },
  };
}

function summarizeFleetEvent(event) {
  return {
    type: event?.type ?? "fleet_snapshot",
    eventId: event?.eventId,
    sequence: event?.sequence,
    timestamp: event?.occurredAt,
    agentRunId: event?.agentRunId,
    workflowRunId: event?.workflowRunId,
    phaseId: event?.phaseId,
  };
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
    if (["steer", "follow_up", "compact", "clear_queue", "reload"].includes(message?.type)) {
      sendResponse(id, true, { result: await handleSessionOperation(message.type, message.payload ?? {}) });
      return;
    }
    if (/^(?:agents|workflows)\./.test(message?.type ?? "")) {
      sendResponse(id, true, { result: await handleFleetOperation(message.type, message.payload ?? {}) });
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
