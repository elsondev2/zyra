import { randomUUID } from "node:crypto";
import path from "node:path";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import {
  defaults,
  getProjectSessionsDir,
  registerZyraRuntimeModels,
  resolveZyraStartupPreferences
} from "../zyra-sdk.mjs";
import { resolveTerminalTheme } from "../terminal-theme.mjs";
import { ZyraAgentServerClient } from "./client.mjs";

export async function createZyraTuiClientRuntime(options = {}) {
  const project = path.resolve(options.project || defaults.project);
  const preferences = resolveZyraStartupPreferences(project, options);
  const client = new ZyraAgentServerClient({
    root: defaults.root,
    clientId: `tui:${process.pid}:${randomUUID()}`,
    surface: "tui",
    ...(options.agentServer || {})
  });
  await client.connect();
  const earlyServerEvents = [];
  const captureEarlyServerEvent = (message) => earlyServerEvents.push(message);
  client.on("session-event", captureEarlyServerEvent);
  let sessionSelector = options.session || undefined;
  if (!sessionSelector && options.sessionMode === "continue") {
    const recent = await client.request("catalog.list", { project, limit: 1 });
    sessionSelector = recent.chats?.[0]?.sessionPath || recent.chats?.[0]?.canonicalChatId;
  }
  const localThreadId = `tui-thread:${randomUUID()}`;
  const attached = await client.attach({
    project,
    cwd: project,
    session: sessionSelector,
    localThreadId,
    noSession: Boolean(options.noSession),
    model: preferences.model,
    thinking: preferences.thinking,
    profile: preferences.profile || "default",
    lastSequence: 0
  });
  const connected = asRecord(attached.connected) || {};
  const canonicalChatId = String(attached.canonicalChatId || attached.sessionKey);
  const modelRegistry = ModelRegistry.create(AuthStorage.create());
  registerZyraRuntimeModels(modelRegistry);
  const model = resolveModel(modelRegistry, String(connected.model || preferences.model));
  const sessionFile = typeof connected.sessionFile === "string" ? connected.sessionFile : null;
  const state = {
    messages: Array.isArray(connected.messages) ? connected.messages.filter(Boolean) : []
  };
  let currentSessionName = asString(connected.sessionName);
  let currentProject = asString(connected.cwd) || asString(connected.project) || project;
  let historyEvents = [];
  let historyCursor = null;
  let historyHasOlder = false;
  try {
    const historyResult = await client.request("catalog.history", {
      session: canonicalChatId,
      project,
      limit: 240
    }, { timeoutMs: 35_000 });
    const history = asRecord(historyResult.history);
    historyEvents = projectHistoryEntries(Array.isArray(history?.entries) ? history.entries : []);
    const pageInfo = asRecord(history?.pageInfo);
    historyCursor = asString(pageInfo?.oldestCursor);
    historyHasOlder = pageInfo?.hasOlder === true;
  } catch {
    historyEvents = projectConnectedMessages(state.messages);
  }
  const eventListeners = new Set();
  const fleetListeners = new Set();
  const activeTools = new Set(["read", "bash", "edit", "write", ...(preferences.webSearch ? ["web_search"] : []), ...(preferences.webFetch ? ["web_fetch"] : [])]);
  const steering = [];
  const followUp = [];
  let disposed = false;
  let latestSequence = 0;
  let activeTurnId = asString(asRecord(attached.activeRequestContext)?.turnId);
  let currentPresence = asRecord(attached.presence);
  let remotelyAttached = true;
  let systemPrompt = "";
  let thinkingLevel = preferences.thinking;
  let currentModel = model;
  let latestFleet = asRecord(connected.fleet);
  let agentDefinitions = normalizeDefinitions(connected.agentDefinitions);
  let workflowDefinitions = normalizeDefinitions(connected.workflowDefinitions);

  const dispatch = (event, requestContext) => {
    if (!event || typeof event !== "object") return;
    if (event.type === "zyra_server_turn_completed") {
      if (!requestContext?.turnId || requestContext.turnId === activeTurnId) activeTurnId = null;
      return;
    }
    if (event.type === "session_title") {
      currentSessionName = asString(event.title) || currentSessionName;
    }
    if (event.type === "session_metadata") {
      currentSessionName = asString(event.title) || currentSessionName;
      currentProject = asString(event.cwd) || asString(event.project) || currentProject;
    }
    updateMessages(state.messages, event);
    if (event.type === "fleet_snapshot" || String(event.type || "").startsWith("agent.") || String(event.type || "").startsWith("workflow.")) {
      latestFleet = asRecord(event.fleet) || latestFleet;
      for (const listener of fleetListeners) listener({ event, snapshot: latestFleet });
    }
    for (const listener of eventListeners) listener(event);
  };

  const consumeServerEntry = (entry) => {
    const sequence = Number(entry?.sequence) || 0;
    if (sequence && sequence <= latestSequence) return;
    if (sequence) latestSequence = sequence;
    dispatch(entry?.event, entry?.requestContext);
  };
  const onServerEvent = (message) => {
    if (message.sessionKey !== canonicalChatId) return;
    consumeServerEntry(message);
  };
  const onDisconnect = () => { remotelyAttached = false; };
  client.on("session-event", onServerEvent);
  client.on("disconnect", onDisconnect);
  client.off("session-event", captureEarlyServerEvent);
  const initialEntries = [
    ...(Array.isArray(attached.replay) ? attached.replay : []),
    ...earlyServerEvents.filter((entry) => entry?.sessionKey === canonicalChatId)
  ].sort((left, right) => (Number(left?.sequence) || 0) - (Number(right?.sequence) || 0));
  for (const entry of initialEntries) consumeServerEntry(entry);
  latestSequence = Math.max(latestSequence, Number(attached.latestSequence) || 0);

  const ensureAttached = async () => {
    if (remotelyAttached) return;
    const result = await client.attach({
      project: currentProject,
      cwd: currentProject,
      session: canonicalChatId,
      localThreadId,
      lastSequence: latestSequence
    });
    remotelyAttached = true;
    currentPresence = asRecord(result.presence) || currentPresence;
    for (const entry of Array.isArray(result.replay) ? result.replay : []) consumeServerEntry(entry);
  };

  const refreshPresence = async () => {
    try {
      const result = await client.request("catalog.list", {
        query: canonicalChatId,
        allProjects: true,
        limit: 4
      });
      const chats = Array.isArray(result.chats) ? result.chats : [];
      const chat = chats.find((entry) => entry?.canonicalChatId === canonicalChatId);
      currentPresence = asRecord(chat?.presence) || currentPresence;
    } catch {}
    return currentPresence;
  };

  const request = async (type, payload = {}, requestContext) => {
    const send = () => client.request("session.request", {
      sessionKey: canonicalChatId,
      type,
      payload,
      ...(requestContext ? { requestContext } : {})
    });
    await ensureAttached();
    try {
      return await send();
    } catch (error) {
      if (!["AGENT_SERVER_SESSION_NOT_FOUND", "AGENT_SERVER_AUTH_FAILED"].includes(String(error?.code || ""))) throw error;
      remotelyAttached = false;
      await ensureAttached();
      return send();
    }
  };

  const sessionManager = {
    getSessionId: () => canonicalChatId,
    getSessionFile: () => sessionFile,
    getSessionName: () => currentSessionName,
    getCwd: () => currentProject,
    getEntries: () => state.messages.map((message, index) => ({ type: "message", id: message.id || `remote-message:${index}`, message })),
    appendCustomEntry: () => undefined
  };

  const session = {
    state,
    messages: state.messages,
    sessionManager,
    modelRegistry,
    get model() { return currentModel; },
    get thinkingLevel() { return thinkingLevel; },
    agent: {
      getSystemPrompt: () => systemPrompt,
      setSystemPrompt: (value) => { systemPrompt = String(value || ""); }
    },
    subscribe(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    async prompt(prompt, promptOptions = {}) {
      if (activeTurnId) throw new Error("This canonical chat already has an active turn.");
      const turnId = `turn:${randomUUID()}`;
      activeTurnId = turnId;
      try {
        return await request("prompt", {
          prompt,
          images: promptOptions.images,
          model: `${currentModel.provider}/${currentModel.id}`,
          thinking: thinkingLevel,
          profile: runtime.profile,
          webSearch: runtime.webSearch,
          webFetch: runtime.webFetch,
          turnId
        }, { turnId, localThreadId: runtime.localThreadId });
      } finally {
        if (activeTurnId === turnId) activeTurnId = null;
      }
    },
    abort: () => request("abort"),
    abortBash: () => undefined,
    async steer(prompt, images) {
      steering.push({ prompt, images });
      try { return await request("steer", { prompt, images }); }
      finally { steering.shift(); }
    },
    async followUp(prompt, images) {
      followUp.push({ prompt, images });
      try { return await request("follow_up", { prompt, images }); }
      finally { followUp.shift(); }
    },
    compact: (instructions) => request("compact", { instructions }),
    reload: () => request("reload"),
    clearQueue() {
      steering.length = 0;
      followUp.length = 0;
      void request("clear_queue").catch(() => undefined);
    },
    getSteeringMessages: () => [...steering],
    getFollowUpMessages: () => [...followUp],
    getActiveToolNames: () => [...activeTools],
    setActiveToolsByName(names) {
      activeTools.clear();
      for (const name of names || []) activeTools.add(String(name));
    },
    getAvailableThinkingLevels: () => ["off", "minimal", "low", "medium", "high", "xhigh"],
    setThinkingLevel(value) { thinkingLevel = String(value || "off"); },
    async setModel(nextModel) { currentModel = nextModel; },
    getContextUsage: () => undefined,
    dispose() {
      if (disposed) return;
      disposed = true;
      client.off("session-event", onServerEvent);
      client.off("disconnect", onDisconnect);
      eventListeners.clear();
      fleetListeners.clear();
      void client.detach(canonicalChatId).catch(() => undefined).finally(() => client.close());
    }
  };

  const fleet = createFleetProxy(request, () => latestFleet, fleetListeners, {
    get: () => agentDefinitions,
    set: (value) => { agentDefinitions = normalizeDefinitions(value); }
  });
  const workflows = createWorkflowProxy(request, () => latestFleet, {
    get: () => workflowDefinitions,
    set: (value) => { workflowDefinitions = normalizeDefinitions(value); }
  });
  const terminalTheme = resolveTerminalTheme(preferences.terminalTheme, { root: defaults.root, project });
  const runtime = {
    session,
    root: defaults.root,
    get project() { return currentProject; },
    get sessions() { return getProjectSessionsDir(currentProject); },
    theme: "dark",
    terminalTheme,
    profile: preferences.profile || "default",
    surface: "tui-client",
    projectMemory: [],
    memoryStartup: null,
    thinking: thinkingLevel,
    thinkingState: { value: thinkingLevel },
    webSearch: preferences.webSearch,
    webFetch: preferences.webFetch,
    statusLine: preferences.statusLine,
    notifications: preferences.notifications,
    interruptMode: preferences.interruptMode,
    codexServiceTier: preferences.codexServiceTier,
    codexServiceTierState: { value: preferences.codexServiceTier },
    managedBash: { abortAll: () => undefined, subscribe: () => () => undefined },
    modelAvailability: null,
    modelFallbackMessage: null,
    fleet,
    workflows,
    localThreadId,
    history: {
      events: () => [...historyEvents],
      hasOlder: () => historyHasOlder,
      async loadOlder() {
        if (!historyHasOlder || !historyCursor) return { events: [...historyEvents], added: 0, hasOlder: false };
        const result = await client.request("catalog.history", {
          session: canonicalChatId,
          project: currentProject,
          before: historyCursor,
          limit: 240
        }, { timeoutMs: 35_000 });
        const history = asRecord(result.history);
        const olderEvents = projectHistoryEntries(Array.isArray(history?.entries) ? history.entries : []);
        historyEvents = [...olderEvents, ...historyEvents];
        const pageInfo = asRecord(history?.pageInfo);
        historyCursor = asString(pageInfo?.oldestCursor);
        historyHasOlder = pageInfo?.hasOlder === true;
        return { events: [...historyEvents], added: olderEvents.length, hasOlder: historyHasOlder };
      }
    },
    agentServer: {
      client,
      canonicalChatId,
      activeTurnId: () => activeTurnId,
      presence: () => currentPresence,
      refreshPresence
    }
  };
  return runtime;
}

export async function listCanonicalZyraChats(options = {}) {
  const client = new ZyraAgentServerClient({
    root: defaults.root,
    clientId: `tui-catalog:${process.pid}:${randomUUID()}`,
    surface: "tui",
    ...(options.agentServer || {})
  });
  try {
    const result = await client.request("catalog.list", {
      project: options.project,
      query: options.query,
      limit: options.limit,
      allProjects: options.allProjects !== false
    });
    return (Array.isArray(result.chats) ? result.chats : []).map((chat) => ({
      path: chat.sessionPath,
      id: chat.canonicalChatId,
      cwd: chat.cwd,
      name: chat.title,
      firstMessage: chat.title,
      created: new Date(chat.createdAt),
      modified: new Date(chat.modifiedAt),
      messageCount: chat.messageCount,
      project: chat.project
    }));
  } finally {
    client.close();
  }
}

function createFleetProxy(request, snapshot, listeners, definitions) {
  const call = (action, payload = {}) => request(`agents.${action}`, payload);
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    snapshot,
    listDefinitions: () => definitions.get(),
    spawn: (input) => call("spawn", input),
    send: (agentRunId, message) => call("send", { agentRunId, message }),
    stop: (agentRunId, reason) => call("stop", { agentRunId, reason }),
    retry: (agentRunId, overrides) => call("retry", { agentRunId, overrides }),
    resume: (agentRunId, message) => call("resume", { agentRunId, message }),
    status: (agentRunId) => snapshot()?.agents?.[agentRunId] || null,
    wait: (agentRunId, options) => call("wait", { agentRunId, ...options }),
    cancelAll: (reason) => Promise.allSettled(Object.keys(snapshot()?.agents || {}).map((agentRunId) => call("stop", { agentRunId, reason }))),
    reloadDefinitions: async () => {
      const result = await call("listDefinitions");
      definitions.set(result);
      return definitions.get();
    },
    dispose: async () => undefined
  };
}

function createWorkflowProxy(request, snapshot, definitions) {
  const call = (action, payload = {}) => request(`workflows.${action}`, payload);
  return {
    listDefinitions: () => definitions.get(),
    listRuns: () => Object.values(snapshot()?.workflows || {}),
    status: (workflowRunId) => snapshot()?.workflows?.[workflowRunId] || null,
    run: (name, args, options) => call("run", { name, args, ...options }),
    pause: (workflowRunId) => call("pause", { workflowRunId }),
    resume: (workflowRunId) => call("resume", { workflowRunId }),
    stop: (workflowRunId, reason) => call("stop", { workflowRunId, reason }),
    restart: (workflowRunId, options) => call("restart", { workflowRunId, ...options }),
    save: (workflowRunId, options) => call("save", { workflowRunId, ...options }),
    reloadDefinitions: async () => definitions.get()
  };
}

function normalizeDefinitions(value) {
  return asRecord(value) || { active: [], shadowed: [], invalid: [], all: [] };
}

function resolveModel(modelRegistry, selector) {
  const [provider, ...idParts] = String(selector || defaults.model).split("/");
  const id = idParts.join("/");
  return modelRegistry.find(provider, id)
    || { provider: provider || "openai-codex", id: id || "gpt-5.6-sol", name: id || "GPT-5.6 Sol", reasoning: true, contextWindow: 400_000 };
}

function updateMessages(messages, event) {
  if (!["message_start", "message_update", "message_end"].includes(event.type) || !event.message) return;
  const incoming = event.message;
  const id = incoming.id;
  const index = id ? messages.findIndex((message) => message?.id === id) : -1;
  if (index >= 0) messages[index] = { ...messages[index], ...incoming };
  else if (event.type !== "message_update" || incoming.role) messages.push(incoming);
}

function projectConnectedMessages(messages) {
  return messages.flatMap((message) => {
    if (message?.role === "user") return [{ type: "message_start", message }];
    if (message?.role === "assistant") return [
      { type: "message_start", message },
      { type: "message_end", message }
    ];
    return [];
  });
}

function projectHistoryEntries(entries) {
  const events = [];
  const tools = new Map();
  for (const entryValue of entries) {
    const entry = asRecord(entryValue);
    if (!entry || entry.type !== "message") continue;
    const message = asRecord(entry.message);
    if (!message) continue;
    const role = asString(message.role);
    const content = normalizeHistoryContent(message.content);
    const id = asString(message.id) || asString(entry.id) || `history:${events.length + 1}`;
    const normalizedMessage = {
      id,
      role,
      content,
      stopReason: asString(message.stopReason),
      errorMessage: asString(message.errorMessage)
    };
    if (role === "user") {
      events.push({ type: "message_start", message: normalizedMessage, historical: true });
      continue;
    }
    if (role === "assistant") {
      const visibleContent = content.flatMap((part, index) => {
        if (part?.type === "text" || part?.type === "thinking") return [part];
        if (part?.type === "image") return [{ type: "text", text: `[Image ${index + 1}: ${part.mimeType || part.mime_type || "image"}]` }];
        return [];
      });
      if (visibleContent.length > 0) {
        const visibleMessage = { ...normalizedMessage, content: visibleContent };
        events.push({ type: "message_start", message: visibleMessage, historical: true });
        events.push({ type: "message_end", message: visibleMessage, historical: true });
      }
      for (const part of content.filter((candidate) => candidate?.type === "toolCall")) {
        const toolCallId = asString(part.id) || `${id}:tool:${tools.size + 1}`;
        const event = {
          type: "tool_execution_start",
          toolCallId,
          toolName: asString(part.name) || "tool",
          args: part.arguments,
          historical: true
        };
        tools.set(toolCallId, event);
        events.push(event);
      }
      if (normalizedMessage.errorMessage && visibleContent.length === 0) {
        events.push({ type: "history_error", errorMessage: normalizedMessage.errorMessage, historical: true });
      }
      continue;
    }
    if (role === "toolResult") {
      const toolCallId = asString(message.toolCallId) || asString(message.tool_call_id) || `${id}:tool-result`;
      const started = tools.get(toolCallId) || {};
      events.push({
        ...started,
        type: "tool_execution_end",
        toolCallId,
        toolName: asString(message.toolName) || started.toolName || "tool",
        result: historyContentText(content),
        output: historyContentText(content),
        isError: message.isError === true,
        historical: true
      });
    }
  }
  return events;
}

function normalizeHistoryContent(value) {
  if (typeof value === "string") return [{ type: "text", text: value }];
  if (!Array.isArray(value)) return [];
  return value.filter((part) => part && typeof part === "object").map((part) => ({ ...part }));
}

function historyContentText(content) {
  return content.flatMap((part, index) => {
    if (part?.type === "text") return [String(part.text || "")];
    if (part?.type === "image") return [`[Image ${index + 1}: ${part.mimeType || part.mime_type || "image"}]`];
    return [];
  }).join("\n");
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function asString(value) {
  return typeof value === "string" && value.trim() ? value : null;
}
