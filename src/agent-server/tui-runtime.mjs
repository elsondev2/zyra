import { randomUUID } from "node:crypto";
import path from "node:path";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import {
  defaults,
  getProjectSessionsDir,
  getZyraModelThinkingLevels,
  registerZyraRuntimeModels,
  resolveZyraStartupPreferences
} from "../zyra-sdk.mjs";
import { resolveTerminalTheme } from "../terminal-theme.mjs";
import { ZyraAgentServerClient } from "./client.mjs";
import { EAGER_HISTORY_TOOL_RESULTS, HISTORY_TOOL_RESULT_BODY_POLICY } from "./history-bodies.mjs";

const MAX_HISTORY_TOOL_RESULT_CACHE_BYTES = 16 * 1024 * 1024;
const MAX_SINGLE_HISTORY_TOOL_RESULT_CACHE_BYTES = 8 * 1024 * 1024;

export async function createZyraTuiClientRuntime(options = {}) {
  const project = path.resolve(options.project || defaults.project);
  const preferences = resolveZyraStartupPreferences(project, options);
  const requestedChatConfig = normalizeRemoteChatConfig({ thinking: options.thinking });
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
    runtimeMode: options.permissionMode === "full-access" || preferences.profile === "yolo-fast" ? "full-access" : "approval-required",
    webSearch: preferences.webSearch,
    webFetch: preferences.webFetch,
    lastSequence: 0
  });
  const connected = asRecord(attached.connected) || {};
  const connectedConfig = normalizeRemoteChatConfig(asRecord(connected.config) || connected);
  const canonicalChatId = String(attached.canonicalChatId || attached.sessionKey);
  const modelRegistry = ModelRegistry.create(AuthStorage.create());
  registerZyraRuntimeModels(modelRegistry);
  const model = resolveModel(modelRegistry, String(connectedConfig.model || connected.model || preferences.model));
  const sessionFile = typeof connected.sessionFile === "string" ? connected.sessionFile : null;
  const state = {
    messages: dedupeRemoteMessages(Array.isArray(connected.messages) ? connected.messages.filter(Boolean) : [])
  };
  const connectedUsage = asRecord(connected.usage);
  const connectedCost = asRecord(connectedUsage?.cost);
  let cumulativeCost = Number(connectedCost?.total);
  if (!Number.isFinite(cumulativeCost)) cumulativeCost = sumRemoteMessageCost(state.messages);
  const costAccountedMessageIds = new Set(state.messages
    .filter((message) => message?.role === "assistant" && message.id)
    .map((message) => message.id));
  let currentSessionName = asString(connected.sessionName);
  let currentProject = asString(connected.cwd) || asString(connected.project) || project;
  let historyEvents = [];
  let historyCursor = null;
  let historyHasOlder = false;
  const historyToolResultCache = new Map();
  const pendingHistoryToolResults = new Map();
  let historyToolResultCacheBytes = 0;
  try {
    const historyResult = await client.request("catalog.history", {
      session: canonicalChatId,
      project,
      limit: 240,
      toolResultBodies: HISTORY_TOOL_RESULT_BODY_POLICY
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
  const respondedApprovalRequestIds = new Set();
  const resolvedApprovalRequestIds = new Set();
  const approvalAbortControllers = new Map();
  let approvalHandler = null;
  const activeTools = new Set(["read", "bash", "edit", "write", ...(preferences.webSearch ? ["web_search"] : []), ...(preferences.webFetch ? ["web_fetch"] : [])]);
  const steering = [];
  const followUp = [];
  let disposed = false;
  let latestSequence = 0;
  let activeTurnId = asString(asRecord(attached.activeRequestContext)?.turnId);
  let currentPresence = asRecord(attached.presence);
  let remotelyAttached = true;
  let systemPrompt = "";
  let thinkingLevel = requestedChatConfig.thinking || connectedConfig.thinking || connected.thinking || preferences.thinking;
  const thinkingState = { value: thinkingLevel };
  let currentModel = model;
  let currentProfile = connectedConfig.profile || connected.profile || preferences.profile || "default";
  let currentPermissionMode = normalizeRemoteRuntimeMode(connectedConfig.runtimeMode || connected.runtimeMode || options.permissionMode || (preferences.profile === "yolo-fast" ? "full-access" : undefined));
  let currentWebSearch = typeof connectedConfig.webSearch === "boolean" ? connectedConfig.webSearch : preferences.webSearch;
  let currentWebFetch = typeof connectedConfig.webFetch === "boolean" ? connectedConfig.webFetch : preferences.webFetch;
  let compacting = false;
  let configSyncQueued = false;
  let latestFleet = asRecord(connected.fleet);
  let agentDefinitions = normalizeDefinitions(connected.agentDefinitions);
  let workflowDefinitions = normalizeDefinitions(connected.workflowDefinitions);

  const dispatch = (event, requestContext) => {
    if (!event || typeof event !== "object") return;
    if (requestContext?.turnId && event.type !== "zyra_server_turn_completed") {
      activeTurnId = requestContext.turnId;
      currentPresence = {
        ...(currentPresence || {}),
        state: "running",
        activeTurnId,
      };
    }
    if (event.type === "zyra_server_turn_completed") {
      if (!requestContext?.turnId || requestContext.turnId === activeTurnId) activeTurnId = null;
      currentPresence = {
        ...(currentPresence || {}),
        state: "ready",
        activeTurnId: null,
      };
      return;
    }
    if (event.type === "session_config") {
      const config = normalizeRemoteChatConfig(event);
      if (config.model) currentModel = resolveModel(modelRegistry, config.model);
      if (config.thinking) {
        thinkingLevel = config.thinking;
        thinkingState.value = config.thinking;
      }
      if (config.profile) currentProfile = config.profile;
      if (config.runtimeMode) currentPermissionMode = config.runtimeMode;
      if (typeof config.webSearch === "boolean") currentWebSearch = config.webSearch;
      if (typeof config.webFetch === "boolean") currentWebFetch = config.webFetch;
    }
    if (event.type === "compaction_start") compacting = true;
    if (event.type === "compaction_end") compacting = false;
    if (event.type === "session_title") {
      currentSessionName = asString(event.title) || currentSessionName;
    }
    if (event.type === "session_metadata") {
      currentSessionName = asString(event.title) || currentSessionName;
      currentProject = asString(event.cwd) || asString(event.project) || currentProject;
    }
    if (event.type === "approval_resolved") {
      const requestId = asString(event.requestId);
      if (requestId) {
        resolvedApprovalRequestIds.add(requestId);
        approvalAbortControllers.get(requestId)?.abort();
        approvalAbortControllers.delete(requestId);
      }
    }
    if (event.type === "approval_requested") {
      const requestId = asString(event.requestId);
      if (requestId && !respondedApprovalRequestIds.has(requestId)) {
        respondedApprovalRequestIds.add(requestId);
        void Promise.resolve().then(async () => {
          if (resolvedApprovalRequestIds.has(requestId)) return;
          const controller = new AbortController();
          approvalAbortControllers.set(requestId, controller);
          let decision = "decline";
          try {
            decision = await approvalHandler?.(event, { signal: controller.signal }) || "decline";
          } catch {}
          approvalAbortControllers.delete(requestId);
          if (resolvedApprovalRequestIds.has(requestId) || controller.signal.aborted) return;
          if (!['acceptOnce', 'acceptForSession', 'decline'].includes(decision)) decision = "decline";
          await request("approval.respond", { requestId, decision }).catch(() => undefined);
        });
      }
    }
    if (event.type === "message_end" && event.message?.role === "assistant" && event.message.id && !costAccountedMessageIds.has(event.message.id)) {
      cumulativeCost += Number(event.message.usage?.cost?.total) || 0;
      costAccountedMessageIds.add(event.message.id);
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
    if (sequence) {
      latestSequence = sequence;
      currentPresence = { ...(currentPresence || {}), latestSequence: sequence };
    }
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
    getSessionUsage: () => ({ cost: { total: cumulativeCost } }),
    appendCustomEntry: () => undefined
  };

  const remoteChatConfig = () => ({
    model: `${currentModel.provider}/${currentModel.id}`,
    thinking: thinkingLevel,
    profile: currentProfile,
    runtimeMode: currentPermissionMode,
    webSearch: currentWebSearch,
    webFetch: currentWebFetch,
  });
  const syncRemoteChatConfig = () => request("configure", remoteChatConfig());
  const queueRemoteChatConfigSync = () => {
    if (configSyncQueued || disposed) return;
    configSyncQueued = true;
    queueMicrotask(() => {
      configSyncQueued = false;
      if (!disposed) void syncRemoteChatConfig().catch(() => undefined);
    });
  };
  if (requestedChatConfig.thinking && requestedChatConfig.thinking !== connectedConfig.thinking) {
    await syncRemoteChatConfig();
  }

  const session = {
    state,
    messages: state.messages,
    sessionManager,
    modelRegistry,
    get model() { return currentModel; },
    get thinkingLevel() { return thinkingLevel; },
    get isStreaming() { return Boolean(activeTurnId); },
    get isCompacting() { return compacting; },
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
          runtimeMode: runtime.permissionMode,
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
      steering.push(String(prompt || ""));
      try { return await request("steer", { prompt, images }); }
      finally { steering.shift(); }
    },
    async followUp(prompt, images) {
      followUp.push(String(prompt || ""));
      try { return await request("follow_up", { prompt, images }); }
      finally { followUp.shift(); }
    },
    compact: (instructions) => request("compact", { instructions }),
    reload: () => request("reload"),
    clearQueue() {
      const queued = { steering: [...steering], followUp: [...followUp] };
      steering.length = 0;
      followUp.length = 0;
      void request("clear_queue").catch(() => undefined);
      return queued;
    },
    getSteeringMessages: () => [...steering],
    getFollowUpMessages: () => [...followUp],
    getActiveToolNames: () => [...activeTools],
    setActiveToolsByName(names) {
      activeTools.clear();
      for (const name of names || []) activeTools.add(String(name));
    },
    acceptsZyraThinkingLevels: true,
    getAvailableThinkingLevels: () => getZyraModelThinkingLevels(currentModel),
    setThinkingLevel(value) {
      thinkingLevel = String(value || "off");
      thinkingState.value = thinkingLevel;
      queueRemoteChatConfigSync();
    },
    async setModel(nextModel) {
      currentModel = nextModel;
      queueRemoteChatConfigSync();
    },
    getContextUsage: () => getRemoteContextUsage(state.messages, currentModel),
    dispose() {
      if (disposed) return;
      disposed = true;
      client.off("session-event", onServerEvent);
      client.off("disconnect", onDisconnect);
      for (const controller of approvalAbortControllers.values()) controller.abort();
      approvalAbortControllers.clear();
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
    get profile() { return currentProfile; },
    set profile(value) { currentProfile = String(value || "default"); queueRemoteChatConfigSync(); },
    get permissionMode() { return currentPermissionMode; },
    set permissionMode(value) { currentPermissionMode = normalizeRemoteRuntimeMode(value); queueRemoteChatConfigSync(); },
    surface: "tui-client",
    projectMemory: [],
    memoryStartup: null,
    get thinking() { return thinkingLevel; },
    set thinking(value) {
      thinkingLevel = String(value || "off");
      thinkingState.value = thinkingLevel;
    },
    thinkingState,
    get webSearch() { return currentWebSearch; },
    set webSearch(value) { currentWebSearch = Boolean(value); queueRemoteChatConfigSync(); },
    get webFetch() { return currentWebFetch; },
    set webFetch(value) { currentWebFetch = Boolean(value); queueRemoteChatConfigSync(); },
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
          limit: 240,
          toolResultBodies: HISTORY_TOOL_RESULT_BODY_POLICY
        }, { timeoutMs: 35_000 });
        const history = asRecord(result.history);
        const olderEvents = projectHistoryEntries(Array.isArray(history?.entries) ? history.entries : []);
        historyEvents = [...olderEvents, ...historyEvents];
        const pageInfo = asRecord(history?.pageInfo);
        historyCursor = asString(pageInfo?.oldestCursor);
        historyHasOlder = pageInfo?.hasOlder === true;
        return { events: [...historyEvents], added: olderEvents.length, hasOlder: historyHasOlder };
      },
      async loadToolResult(ref) {
        const key = `${ref?.canonicalChatId || canonicalChatId}:${ref?.entryIndex}:${ref?.entrySha256 || ref?.entryId}`;
        const cached = historyToolResultCache.get(key);
        if (cached) {
          historyToolResultCache.delete(key);
          historyToolResultCache.set(key, cached);
          return { content: cached.content, isError: cached.isError, output: historyContentText(cached.content) };
        }
        if (pendingHistoryToolResults.has(key)) return pendingHistoryToolResults.get(key);
        const pending = client.request("catalog.entry.body", {
          session: canonicalChatId,
          project: currentProject,
          ref
        }, { timeoutMs: 35_000 }).then((result) => {
          const entry = asRecord(asRecord(result.body)?.entry);
          const message = asRecord(entry?.message);
          const content = normalizeHistoryContent(message?.content);
          const hydrated = { content, isError: message?.isError === true };
          const output = historyContentText(content);
          const bodyBytes = Math.max(0, Number(ref?.bodyBytes) || Buffer.byteLength(output, "utf8"));
          if (bodyBytes <= MAX_SINGLE_HISTORY_TOOL_RESULT_CACHE_BYTES) {
            historyToolResultCache.set(key, { ...hydrated, bytes: bodyBytes });
            historyToolResultCacheBytes += bodyBytes;
            while (historyToolResultCache.size > EAGER_HISTORY_TOOL_RESULTS || historyToolResultCacheBytes > MAX_HISTORY_TOOL_RESULT_CACHE_BYTES) {
              const oldest = historyToolResultCache.keys().next().value;
              const evicted = historyToolResultCache.get(oldest);
              historyToolResultCache.delete(oldest);
              historyToolResultCacheBytes -= Number(evicted?.bytes) || 0;
            }
          }
          return { ...hydrated, output };
        }).finally(() => pendingHistoryToolResults.delete(key));
        pendingHistoryToolResults.set(key, pending);
        return pending;
      }
    },
    agentServer: {
      client,
      canonicalChatId,
      activeTurnId: () => activeTurnId,
      presence: () => currentPresence,
      refreshPresence,
      setApprovalHandler(handler) {
        approvalHandler = typeof handler === "function" ? handler : null;
      },
      respondApproval(requestId, decision) {
        return request("approval.respond", { requestId, decision });
      }
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
  let index = id ? messages.findIndex((message) => message?.id === id) : -1;
  if (index < 0 && event.type !== "message_start" && incoming.role) {
    for (let candidate = messages.length - 1; candidate >= 0; candidate -= 1) {
      if (messages[candidate]?.role === incoming.role) {
        index = candidate;
        break;
      }
    }
  }
  if (index >= 0) messages[index] = { ...messages[index], ...incoming };
  else if (event.type !== "message_update" || incoming.role) messages.push(incoming);
}

function dedupeRemoteMessages(messages) {
  const result = [];
  const indexById = new Map();
  for (const message of messages) {
    const id = message?.id;
    const existingIndex = id ? indexById.get(id) : undefined;
    if (existingIndex !== undefined) {
      result[existingIndex] = { ...result[existingIndex], ...message };
      continue;
    }
    if (id) indexById.set(id, result.length);
    result.push(message);
  }
  return result;
}

function normalizeRemoteRuntimeMode(value) {
  return value === "full-access" ? "full-access" : "approval-required";
}

function normalizeRemoteChatConfig(value) {
  const source = asRecord(value) || {};
  const thinking = asString(source.thinking);
  return {
    model: asString(source.model),
    thinking: ["off", "none", "minimal", "low", "medium", "high", "xhigh", "max"].includes(thinking) ? thinking : null,
    profile: asString(source.profile),
    runtimeMode: source.runtimeMode === "full-access" || source.runtimeMode === "approval-required" ? source.runtimeMode : null,
    webSearch: typeof source.webSearch === "boolean" ? source.webSearch : undefined,
    webFetch: typeof source.webFetch === "boolean" ? source.webFetch : undefined,
  };
}

function sumRemoteMessageCost(messages) {
  return messages.reduce((total, message) => (
    message?.role === "assistant" ? total + (Number(message.usage?.cost?.total) || 0) : total
  ), 0);
}

function getRemoteContextUsage(messages, model) {
  const contextWindow = Number(model?.contextWindow) || 0;
  if (contextWindow <= 0) return undefined;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant" || message.stopReason === "aborted" || message.stopReason === "error") continue;
    const usage = asRecord(message.usage);
    if (!usage) continue;
    const tokens = Number(usage.totalTokens ?? usage.total)
      || [usage.input, usage.output, usage.cacheRead, usage.cacheWrite].reduce((sum, value) => sum + (Number(value) || 0), 0);
    if (tokens <= 0) continue;
    return { tokens, contextWindow, percent: (tokens / contextWindow) * 100 };
  }
  return undefined;
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
      const historyBodyRef = asRecord(entry.historyBodyRef);
      events.push({
        ...started,
        type: "tool_execution_end",
        toolCallId,
        toolName: asString(message.toolName) || started.toolName || "tool",
        ...(historyBodyRef
          ? { historyBodyRef: { ...historyBodyRef } }
          : { result: { content } }),
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
