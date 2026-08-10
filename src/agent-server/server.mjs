import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { EventEmitter } from "node:events";
import { AgentBridgeWorker } from "./bridge-worker.mjs";
import { AgentEventJournal } from "./event-journal.mjs";
import { CanonicalChatCatalog } from "./catalog.mjs";
import { getAgentServerPaths } from "./paths.mjs";
import {
  AGENT_SERVER_PROTOCOL_VERSION,
  AgentServerProtocolError,
  MAX_AGENT_SERVER_REPLAY_EVENTS,
  assertAgentServerIdentifier,
  assertAgentServerMessageSize,
  assertAgentServerMethod,
  createAgentServerLineReader,
  writeAgentServerMessage
} from "./protocol.mjs";

const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const HANDSHAKE_TIMEOUT_MS = 5_000;
const BRIDGE_CONNECT_TIMEOUT_MS = 60_000;
const ACTIVE_FLEET_STATUSES = new Set(["queued", "starting", "running", "waiting", "paused", "recovering"]);
const BRIDGE_REQUEST_PATTERN = /^(?:prompt|configure|abort|steer|follow_up|compact|clear_queue|reload|canonical_message\.(?:append|find)|approval\.respond|agents\.[a-zA-Z0-9._-]+|workflows\.[a-zA-Z0-9._-]+)$/;

function hashAuthorityProof(value) {
  return createHash("sha256").update(String(value || "")).digest("base64url");
}

function tokensMatch(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue || ""));
  const right = Buffer.from(String(rightValue || ""));
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

function normalizeRequestContext(value) {
  if (!value || typeof value !== "object") return null;
  const turnId = value.turnId ? assertAgentServerIdentifier(value.turnId, "turn id") : null;
  const localThreadId = value.localThreadId ? assertAgentServerIdentifier(value.localThreadId, "local thread id") : null;
  if (!turnId && !localThreadId) return null;
  return Object.freeze({ ...(turnId ? { turnId } : {}), ...(localThreadId ? { localThreadId } : {}) });
}

export class ZyraAgentServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.root = path.resolve(options.root || path.resolve(import.meta.dirname, "../.."));
    this.paths = getAgentServerPaths(options);
    this.endpoint = options.endpoint !== undefined ? options.endpoint : this.paths.endpoint;
    this.token = options.token || randomBytes(32).toString("base64url");
    this.desktopAuthorityHash = options.desktopAuthorityToken
      ? hashAuthorityProof(options.desktopAuthorityToken)
      : String(options.desktopAuthorityHash || "").trim() || null;
    this.idleTimeoutMs = Math.max(1_000, Number(options.idleTimeoutMs) || DEFAULT_IDLE_TIMEOUT_MS);
    this.createWorker = options.createWorker || ((input) => new AgentBridgeWorker(input));
    this.catalog = options.catalog || new CanonicalChatCatalog(options);
    this.clients = new Map();
    this.sessions = new Map();
    this.utilityWorker = null;
    this.canonicalMessageQueues = new Map();
    this.server = null;
    this.startedAt = null;
  }

  async start() {
    if (this.server) return this.descriptor();
    mkdirSync(this.paths.stateDirectory, { recursive: true });
    if (!this.desktopAuthorityHash) {
      try {
        this.desktopAuthorityHash = readFileSync(this.paths.desktopAuthorityFile, "utf8").trim() || null;
      } catch {}
    }
    if (process.platform !== "win32" && existsSync(this.endpoint)) rmSync(this.endpoint, { force: true });
    this.server = net.createServer((socket) => this.accept(socket));
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.endpoint, resolve);
    });
    if (this.endpoint === 0) {
      const address = this.server.address();
      if (!address || typeof address === "string") throw new Error("Agent-server test endpoint did not bind to TCP.");
      this.endpoint = address.port;
    }
    this.startedAt = new Date().toISOString();
    if (this.desktopAuthorityHash) {
      writeFileSync(this.paths.desktopAuthorityFile, this.desktopAuthorityHash, { encoding: "utf8", mode: 0o600 });
    }
    this.writeDescriptor();
    return this.descriptor();
  }

  async stop(reason = "Agent server stopped.") {
    for (const session of new Set(this.sessions.values())) session.dispose(reason);
    this.sessions.clear();
    this.utilityWorker?.dispose(reason);
    this.utilityWorker = null;
    for (const client of this.clients.values()) client.socket.destroy();
    this.clients.clear();
    const server = this.server;
    this.server = null;
    if (server) {
      const closed = new Promise((resolve) => server.close(resolve));
      server.closeAllConnections?.();
      await closed;
    }
    if (process.platform !== "win32") rmSync(this.endpoint, { force: true });
    rmSync(this.paths.descriptorFile, { force: true });
  }

  descriptor() {
    return {
      version: AGENT_SERVER_PROTOCOL_VERSION,
      pid: process.pid,
      endpoint: this.endpoint,
      token: this.token,
      channel: this.paths.channel,
      startedAt: this.startedAt
    };
  }

  state() {
    const uniqueSessions = [...new Set(this.sessions.values())];
    return {
      version: AGENT_SERVER_PROTOCOL_VERSION,
      pid: process.pid,
      startedAt: this.startedAt,
      clients: this.clients.size,
      sessions: uniqueSessions.map((session) => session.summary())
    };
  }

  accept(socket) {
    const connectionId = `agent-client:${randomUUID()}`;
    const client = {
      connectionId,
      clientId: null,
      surface: null,
      canControl: false,
      authenticated: false,
      socket,
      attachedSessionIds: new Set(),
      cleanupReader: null,
      handshakeTimer: null
    };
    client.handshakeTimer = setTimeout(() => socket.destroy(), HANDSHAKE_TIMEOUT_MS);
    client.handshakeTimer.unref?.();
    client.cleanupReader = createAgentServerLineReader(
      socket,
      (message) => void this.handleClientMessage(client, message),
      (error) => this.sendError(client, undefined, error)
    );
    socket.on("error", () => undefined);
    socket.once("close", () => this.dropClient(client));
  }

  async handleClientMessage(client, message) {
    try {
      assertAgentServerMessageSize(message);
      if (!client.authenticated) {
        this.authenticate(client, message);
        return;
      }
      if (message?.type === "control.response") {
        this.handleControlResponse(client, message);
        return;
      }
      if (message?.type !== "request") throw new AgentServerProtocolError("Expected an agent-server request.");
      const id = assertAgentServerIdentifier(message.id, "request id");
      const method = assertAgentServerMethod(message.method);
      const result = await this.handleRequest(client, method, message.params || {});
      this.send(client, { type: "response", id, ok: true, result });
    } catch (error) {
      this.sendError(client, message?.id, error);
      if (!client.authenticated) client.socket.destroy();
    }
  }

  authenticate(client, message) {
    if (message?.type !== "hello" || message.version !== AGENT_SERVER_PROTOCOL_VERSION || !tokensMatch(message.token, this.token)) {
      throw new AgentServerProtocolError("Agent-server authentication failed.", "AGENT_SERVER_AUTH_FAILED");
    }
    client.clientId = assertAgentServerIdentifier(message.clientId, "client id");
    client.surface = String(message.surface || "unknown").slice(0, 64);
    const expectedAuthorityHash = this.getDesktopAuthorityHash();
    client.canControl = client.surface === "desktop"
      && message.authorities?.includes?.("desktop-control") === true
      && Boolean(expectedAuthorityHash)
      && tokensMatch(hashAuthorityProof(message.authorityProof), expectedAuthorityHash);
    client.authenticated = true;
    clearTimeout(client.handshakeTimer);
    this.clients.set(client.connectionId, client);
    this.send(client, {
      type: "hello.ok",
      version: AGENT_SERVER_PROTOCOL_VERSION,
      connectionId: client.connectionId,
      server: this.state()
    });
  }

  getDesktopAuthorityHash() {
    return this.desktopAuthorityHash;
  }

  async handleRequest(client, method, params) {
    if (method === "server.status") return this.state();
    if (method === "runtime.models") {
      return this.getUtilityWorker().request("warmup", { forceRefresh: params.forceRefresh === true }, { timeoutMs: 60_000 });
    }
    if (method === "runtime.generateText") {
      return this.getUtilityWorker().request("generate_text", params);
    }
    if (method === "catalog.registerProject") {
      return { project: this.catalog.registerProject(params.project) };
    }
    if (method === "catalog.list") {
      const chats = await this.catalog.list(params);
      return { chats: chats.map((chat) => ({ ...chat, presence: this.sessionPresence(chat.canonicalChatId) })) };
    }
    if (method === "catalog.history") {
      return { history: await this.catalog.history(params.session, params) };
    }
    if (method === "catalog.message.append" || method === "catalog.message.find") {
      if (!client.canControl) {
        throw new AgentServerProtocolError("Canonical message writes require verified Desktop authority.", "AGENT_SERVER_AUTH_FAILED");
      }
      const selector = String(params.session || params.conversationId || "").trim();
      if (!selector) throw new AgentServerProtocolError("Canonical chat id is required.");
      const canonicalChatId = this.catalog.resolveAlias(selector);
      if (method === "catalog.message.append"
        && String(params.message?.conversationId || "").trim() !== canonicalChatId) {
        throw new AgentServerProtocolError("Canonical message conversation does not match its selected transcript.");
      }
      return this.withCanonicalMessageLock(canonicalChatId, async () => {
        const activeSession = this.sessions.get(canonicalChatId);
        const receipt = activeSession
          ? method === "catalog.message.append"
            ? await activeSession.appendCanonicalMessage(params.message)
            : await activeSession.findCanonicalMessageReceipt(params.operationId)
          : method === "catalog.message.append"
            ? await this.catalog.appendCanonicalMessage(canonicalChatId, params.message)
            : await this.catalog.findCanonicalMessageReceipt(canonicalChatId, params.operationId);
        if (method === "catalog.message.append") {
          this.broadcastCatalogChanged({ canonicalChatId, canonicalMessage: true });
        }
        return { receipt };
      });
    }
    if (method === "catalog.update") {
      const chat = await this.catalog.updateChat(params.session, {
        ...(params.title !== undefined ? { title: params.title } : {}),
        ...(params.project !== undefined ? { project: params.project } : {}),
        ...(params.cwd !== undefined ? { cwd: params.cwd } : {}),
        ...(params.archived !== undefined ? { archived: params.archived === true } : {})
      });
      const activeSession = this.sessions.get(chat.canonicalChatId);
      if (activeSession) {
        activeSession.connectedResult = {
          ...(activeSession.connectedResult || {}),
          sessionName: chat.title,
          project: chat.project,
          cwd: chat.cwd,
          archived: chat.archived
        };
        activeSession.publish({
          type: "session_metadata",
          title: chat.title,
          project: chat.project,
          cwd: chat.cwd,
          archived: chat.archived
        });
      }
      this.broadcastCatalogChanged({ canonicalChatId: chat.canonicalChatId, metadata: true });
      return { chat: { ...chat, presence: this.sessionPresence(chat.canonicalChatId) } };
    }
    if (method === "session.attach") return this.attachSession(client, params);
    const session = this.requireSession(params.sessionKey);
    if (!session.clients.has(client)) {
      throw new AgentServerProtocolError("Client is not attached to this canonical chat.", "AGENT_SERVER_AUTH_FAILED");
    }
    if (method === "session.request") return session.request(client, params.type, params.payload || {}, params.requestContext);
    if (method === "session.detach") {
      session.detach(client);
      return { detached: true, sessionKey: session.sessionKey };
    }
    if (method === "session.stop") {
      session.dispose(String(params.reason || "Session stopped explicitly."));
      this.removeSession(session);
      return { stopped: true, sessionKey: session.sessionKey };
    }
    throw new AgentServerProtocolError(`Unsupported method: ${method}.`);
  }

  async withCanonicalMessageLock(canonicalChatId, operation) {
    const previous = this.canonicalMessageQueues.get(canonicalChatId) || Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.canonicalMessageQueues.set(canonicalChatId, current);
    try {
      return await current;
    } finally {
      if (this.canonicalMessageQueues.get(canonicalChatId) === current) this.canonicalMessageQueues.delete(canonicalChatId);
    }
  }

  sessionPresence(sessionKeyValue) {
    const sessionKey = String(sessionKeyValue || "").trim();
    const session = this.sessions.get(sessionKey);
    if (!session) return {
      state: "detached",
      activeTurnId: null,
      clients: [],
      backgroundWorkActive: false,
      attention: null,
      latestTurn: null
    };
    return {
      state: session.activeRequestContext ? "running" : session.hasBackgroundWork() ? "background" : "ready",
      activeTurnId: session.activeRequestContext?.turnId || null,
      clients: [...session.clients].map((client) => ({ clientId: client.clientId, surface: client.surface })),
      backgroundWorkActive: session.hasBackgroundWork(),
      attention: session.pendingApprovalRequestIds.size > 0 ? "approval" : null,
      latestTurn: session.latestTurn ? { ...session.latestTurn } : null,
      latestSequence: session.sequence
    };
  }

  getUtilityWorker() {
    if (this.utilityWorker?.isAlive()) return this.utilityWorker;
    this.utilityWorker = this.createWorker({ root: this.root, cwd: this.root });
    this.utilityWorker.on("stderr", (text) => this.emit("worker-stderr", { sessionKey: "utility", text }));
    this.utilityWorker.on("worker-error", (error) => this.emit("worker-error", { sessionKey: "utility", error }));
    this.utilityWorker.on("exit", () => { this.utilityWorker = null; });
    return this.utilityWorker;
  }

  async attachSession(client, params) {
    const project = this.catalog.registerProject(params.project || params.cwd);
    const requested = params.session ? await this.catalog.find(params.session, { project }) : null;
    const requestedCanonicalId = requested?.canonicalChatId || this.catalog.resolveAlias(params.session || params.localThreadId || "");
    const sessionProject = requested?.project || project;
    const sessionCwd = requested?.cwd || requested?.project || params.cwd || project;
    const provisionalKey = requestedCanonicalId || `pending:${assertAgentServerIdentifier(params.localThreadId || randomUUID(), "local thread id")}`;
    let session = this.sessions.get(provisionalKey);
    if (!session) {
      session = new ServerOwnedSession({
        server: this,
        sessionKey: provisionalKey,
        root: this.root,
        cwd: sessionCwd,
        createWorker: this.createWorker,
        idleTimeoutMs: this.idleTimeoutMs,
        journalDirectory: this.paths.journalDirectory
      });
      this.sessions.set(provisionalKey, session);
    }
    try {
      const connected = await session.connect({
        ...params,
        cwd: sessionCwd,
        project: sessionProject,
        threadId: requested?.sessionPath || params.session,
        providerThreadId: requested?.sessionPath || params.session
      });
      const canonicalChatId = String(connected.threadId || connected.providerThreadId || requestedCanonicalId || provisionalKey);
      session.connectedResult = {
        ...connected,
        sessionName: connected.sessionName || requested?.title || undefined,
        project: sessionProject,
        cwd: sessionCwd
      };
      session.setCanonicalKey(canonicalChatId);
      this.sessions.set(canonicalChatId, session);
      for (const [key, candidate] of this.sessions) {
        if (candidate === session && key !== canonicalChatId) this.sessions.delete(key);
      }
      this.catalog.recordAttachment({
        canonicalChatId,
        project: sessionProject,
        localThreadId: params.localThreadId,
        aliases: [params.session],
        surface: client.surface
      });
      this.broadcastCatalogChanged({ canonicalChatId, project: sessionProject });
    } catch (error) {
      session.dispose("Session connection failed.");
      this.removeSession(session);
      throw error;
    }
    session.attach(client);
    const lastSequence = Math.max(0, Number(params.lastSequence) || 0);
    return {
      sessionKey: session.sessionKey,
      canonicalChatId: session.sessionKey,
      connected: session.connectedResult,
      replay: session.replay(lastSequence),
      latestSequence: session.sequence,
      activeRequestContext: session.activeRequestContext,
      presence: this.sessionPresence(session.sessionKey)
    };
  }

  requireSession(sessionKeyValue) {
    const sessionKey = String(sessionKeyValue || "").trim();
    const session = this.sessions.get(sessionKey);
    if (!session) throw new AgentServerProtocolError("Agent-server session was not found.", "AGENT_SERVER_SESSION_NOT_FOUND");
    return session;
  }

  routeControlRequest(session, message) {
    if (message.type === "control.cancel") {
      const owner = session.controlOwners.get(message.requestId);
      if (owner) this.send(owner, { ...message, sessionKey: session.sessionKey, requestContext: session.activeRequestContext });
      return;
    }
    const client = [...session.clients].find((candidate) => candidate.authenticated && candidate.canControl && candidate.socket.writable);
    if (!client) {
      session.worker.sendControlResponse({
        type: "control.response",
        requestId: message.requestId,
        ok: false,
        error: { code: "CONTROL_DRIVER_UNAVAILABLE", message: "No attached desktop client owns control authority for this chat.", retryable: true }
      });
      return;
    }
    session.controlOwners.set(message.requestId, client);
    this.send(client, { ...message, sessionKey: session.sessionKey, requestContext: session.activeRequestContext });
  }

  handleControlResponse(client, message) {
    const session = this.requireSession(message.sessionKey);
    const owner = session.controlOwners.get(message.requestId);
    if (owner !== client) throw new AgentServerProtocolError("Control response came from a client without matching authority.", "AGENT_SERVER_AUTH_FAILED");
    session.controlOwners.delete(message.requestId);
    session.worker.sendControlResponse({
      type: "control.response",
      requestId: message.requestId,
      ok: message.ok === true,
      ...(message.ok === true ? { result: message.result || {} } : { error: message.error || { code: "CONTROL_ERROR", message: "Control request failed.", retryable: false } })
    });
  }

  dropClient(client) {
    clearTimeout(client.handshakeTimer);
    client.cleanupReader?.();
    this.clients.delete(client.connectionId);
    for (const session of new Set(this.sessions.values())) session.detach(client);
  }

  broadcastCatalogChanged(change) {
    for (const client of this.clients.values()) {
      if (client.authenticated) this.send(client, { type: "catalog.changed", change, occurredAt: new Date().toISOString() });
    }
  }

  removeSession(session) {
    for (const [key, candidate] of this.sessions) if (candidate === session) this.sessions.delete(key);
  }

  send(client, message) {
    try {
      return writeAgentServerMessage(client.socket, message);
    } catch (error) {
      this.emit("protocol-send-error", { connectionId: client.connectionId, messageType: message?.type, error });
      try {
        if (message?.type === "response" && message.id) {
          return writeAgentServerMessage(client.socket, {
            type: "response",
            id: message.id,
            ok: false,
            error: { code: "AGENT_SERVER_RESPONSE_TOO_LARGE", message: "Agent-server response exceeded the transport limit.", retryable: true }
          });
        }
        if (message?.type === "session.event") {
          return writeAgentServerMessage(client.socket, {
            type: "session.event",
            sessionKey: message.sessionKey,
            sequence: message.sequence,
            occurredAt: message.occurredAt,
            requestContext: message.requestContext,
            event: { type: "zyra_server_event_omitted", reason: "transport-limit" }
          });
        }
      } catch {}
      return false;
    }
  }

  sendError(client, id, error) {
    const message = error instanceof Error ? error.message : String(error || "Agent-server request failed.");
    this.send(client, {
      type: "response",
      ...(id ? { id: String(id) } : {}),
      ok: false,
      error: {
        code: error?.code || "AGENT_SERVER_ERROR",
        message,
        retryable: Boolean(error?.retryable)
      }
    });
  }

  writeDescriptor() {
    mkdirSync(this.paths.stateDirectory, { recursive: true });
    const temporary = `${this.paths.descriptorFile}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.descriptor(), null, 2), { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, this.paths.descriptorFile);
  }
}

class ServerOwnedSession {
  constructor(options) {
    this.server = options.server;
    this.sessionKey = options.sessionKey;
    this.worker = options.createWorker({ root: options.root, cwd: options.cwd });
    this.idleTimeoutMs = options.idleTimeoutMs;
    this.clients = new Set();
    this.controlOwners = new Map();
    this.events = [];
    this.sequence = 0;
    this.journalDirectory = options.journalDirectory;
    this.journal = null;
    this.activeRequests = 0;
    this.activeRequestContext = null;
    this.latestTurn = null;
    this.pendingApprovalRequestIds = new Set();
    this.backgroundFleetActive = false;
    this.managedJobIds = new Set();
    this.connectPromise = null;
    this.connectedResult = null;
    this.idleTimer = null;
    this.disposed = false;
    if (!this.sessionKey.startsWith("pending:")) this.openJournal(this.sessionKey);
    this.worker.on("event", (event) => this.publish(event));
    this.worker.on("control", (message) => this.server.routeControlRequest(this, message));
    this.worker.on("stderr", (text) => this.server.emit("worker-stderr", { sessionKey: this.sessionKey, text }));
    this.worker.on("worker-error", (error) => this.server.emit("worker-error", { sessionKey: this.sessionKey, error }));
    this.worker.on("exit", ({ error }) => {
      this.publish({ type: "server.worker.exited", error: error.message });
      this.server.removeSession(this);
    });
  }

  connect(payload) {
    if (this.connectedResult) return Promise.resolve(this.connectedResult);
    if (!this.connectPromise) {
      this.connectPromise = this.worker.request("connect", payload, { timeoutMs: BRIDGE_CONNECT_TIMEOUT_MS })
        .then((result) => {
          this.connectedResult = result;
          return result;
        })
        .catch((error) => {
          this.connectPromise = null;
          throw error;
        });
    }
    return this.connectPromise;
  }

  setCanonicalKey(value) {
    const canonicalChatId = String(value || this.sessionKey);
    if (canonicalChatId === this.sessionKey && this.journal) return;
    this.sessionKey = canonicalChatId;
    this.openJournal(canonicalChatId);
  }

  openJournal(canonicalChatId) {
    const pendingEvents = this.events;
    const journal = new AgentEventJournal(this.journalDirectory, canonicalChatId);
    this.journal = journal;
    this.events = journal.replay(0);
    this.sequence = journal.latestSequence();
    for (const pending of pendingEvents) {
      const entry = { ...pending, sequence: ++this.sequence };
      this.events.push(entry);
      this.journal.append(entry);
    }
    if (this.events.length > MAX_AGENT_SERVER_REPLAY_EVENTS) {
      this.events.splice(0, this.events.length - MAX_AGENT_SERVER_REPLAY_EVENTS);
    }
    this.rebuildLatestTurnSummary();
  }

  attach(client) {
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.clients.add(client);
    client.attachedSessionIds.add(this.sessionKey);
    this.server.broadcastCatalogChanged({ canonicalChatId: this.sessionKey, presence: true });
  }

  detach(client) {
    this.clients.delete(client);
    client.attachedSessionIds.delete(this.sessionKey);
    for (const [requestId, owner] of this.controlOwners) {
      if (owner !== client) continue;
      this.controlOwners.delete(requestId);
      this.worker.sendControlResponse({
        type: "control.response",
        requestId,
        ok: false,
        error: { code: "CONTROL_DRIVER_UNAVAILABLE", message: "Desktop control authority disconnected.", retryable: true }
      });
    }
    this.server.broadcastCatalogChanged({ canonicalChatId: this.sessionKey, presence: true });
    this.scheduleIdleStop();
  }

  async appendCanonicalMessage(input) {
    if (this.activeRequestContext) {
      throw new AgentServerProtocolError("Canonical Voice cannot append while the strong foreground turn is active.", "AGENT_SERVER_SESSION_BUSY");
    }
    const result = await this.worker.request("canonical_message.append", input);
    return result.receipt || null;
  }

  async findCanonicalMessageReceipt(operationId) {
    const result = await this.worker.request("canonical_message.find", { operationId });
    return result.receipt || null;
  }

  async request(_client, typeValue, payload, requestContextValue) {
    const type = String(typeValue || "");
    if (!BRIDGE_REQUEST_PATTERN.test(type)) throw new AgentServerProtocolError(`Bridge request type is not allowed: ${type || "missing"}.`);
    const requestContext = normalizeRequestContext(requestContextValue);
    if (type === "prompt" && !requestContext?.turnId) {
      throw new AgentServerProtocolError("Prompt requests require a durable turn id.");
    }
    if (type === "prompt" && this.activeRequestContext) {
      throw new AgentServerProtocolError("This canonical chat already has an active turn.", "AGENT_SERVER_SESSION_BUSY");
    }
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.activeRequests += 1;
    if (type === "prompt") {
      this.activeRequestContext = requestContext;
      const startedAt = new Date().toISOString();
      this.latestTurn = {
        id: requestContext.turnId,
        state: "running",
        requestedAt: startedAt,
        startedAt,
        completedAt: null,
        assistantMessageId: null
      };
      this.server.broadcastCatalogChanged({ canonicalChatId: this.sessionKey, presence: true });
    }
    try {
      const result = await this.worker.request(type, payload);
      if (type === "prompt") this.publish({ type: "zyra_server_turn_completed", outcome: "completed" });
      return result;
    } catch (error) {
      if (type === "prompt") {
        this.publish({
          type: "zyra_server_turn_completed",
          outcome: "failed",
          errorMessage: error instanceof Error ? error.message : String(error || "Zyra prompt failed.")
        });
      }
      throw error;
    } finally {
      this.activeRequests = Math.max(0, this.activeRequests - 1);
      if (type === "prompt" && this.activeRequestContext === requestContext) {
        this.activeRequestContext = null;
        this.server.broadcastCatalogChanged({ canonicalChatId: this.sessionKey });
      }
      this.scheduleIdleStop();
    }
  }

  publish(event) {
    const occurredAt = new Date().toISOString();
    const previousAttention = this.pendingApprovalRequestIds.size > 0;
    const previousBackgroundWork = this.hasBackgroundWork();
    this.updateBackgroundWork(event);
    this.updateRuntimeSummary(event, this.activeRequestContext, occurredAt);
    if (event?.type === "session_config") {
      const config = {
        model: event.model,
        thinking: event.thinking,
        profile: event.profile,
        runtimeMode: event.runtimeMode,
        webSearch: event.webSearch,
        webFetch: event.webFetch
      };
      this.connectedResult = { ...(this.connectedResult || {}), ...config, config };
    }
    if (event?.type === "session_title" && event.title) {
      void this.server.catalog.updateChat(this.sessionKey, { title: event.title }).then(() => {
        this.server.broadcastCatalogChanged({ canonicalChatId: this.sessionKey, title: true });
      });
    }
    const entry = {
      sequence: ++this.sequence,
      occurredAt,
      event,
      ...(this.activeRequestContext ? { requestContext: this.activeRequestContext } : {})
    };
    this.events.push(entry);
    try {
      this.journal?.append(entry);
    } catch (error) {
      this.server.emit("journal-error", { sessionKey: this.sessionKey, error });
    }
    if (this.events.length > MAX_AGENT_SERVER_REPLAY_EVENTS) this.events.splice(0, this.events.length - MAX_AGENT_SERVER_REPLAY_EVENTS);
    for (const client of this.clients) {
      this.server.send(client, { type: "session.event", sessionKey: this.sessionKey, ...entry });
    }
    if (
      previousAttention !== (this.pendingApprovalRequestIds.size > 0)
      || previousBackgroundWork !== this.hasBackgroundWork()
    ) {
      this.server.broadcastCatalogChanged({ canonicalChatId: this.sessionKey, presence: true });
    }
    this.scheduleIdleStop();
  }

  rebuildLatestTurnSummary() {
    this.latestTurn = null;
    for (const entry of this.events) {
      this.updateLatestTurnSummary(entry.event, entry.requestContext, entry.occurredAt);
    }
  }

  updateRuntimeSummary(event, requestContext, occurredAt) {
    if (event?.type === "approval_requested" && event.requestId) {
      this.pendingApprovalRequestIds.add(String(event.requestId));
    }
    if (event?.type === "approval_resolved" && event.requestId) {
      this.pendingApprovalRequestIds.delete(String(event.requestId));
    }
    this.updateLatestTurnSummary(event, requestContext, occurredAt);
    if (event?.type === "zyra_server_turn_completed") this.pendingApprovalRequestIds.clear();
  }

  updateLatestTurnSummary(event, requestContext, occurredAt) {
    const turnId = String(requestContext?.turnId || "").trim();
    if (turnId && this.latestTurn?.id !== turnId) {
      this.latestTurn = {
        id: turnId,
        state: "running",
        requestedAt: occurredAt,
        startedAt: occurredAt,
        completedAt: null,
        assistantMessageId: null
      };
    }
    if (event?.type === "message_end" && event.message?.role === "assistant" && event.message.id && this.latestTurn) {
      this.latestTurn = { ...this.latestTurn, assistantMessageId: String(event.message.id) };
    }
    if (event?.type !== "zyra_server_turn_completed") return;
    const completedTurnId = turnId || this.latestTurn?.id;
    if (!completedTurnId) return;
    const base = this.latestTurn?.id === completedTurnId
      ? this.latestTurn
      : {
          id: completedTurnId,
          requestedAt: occurredAt,
          startedAt: occurredAt,
          assistantMessageId: null
        };
    const outcome = String(event.outcome || "completed");
    this.latestTurn = {
      ...base,
      state: outcome === "failed" ? "error" : outcome === "interrupted" ? "interrupted" : "completed",
      completedAt: occurredAt
    };
  }

  updateBackgroundWork(event) {
    if (!event || typeof event !== "object") return;
    if (event.type === "managed_bash_job_update" && event.jobId) {
      if (event.status === "running") this.managedJobIds.add(String(event.jobId));
      else this.managedJobIds.delete(String(event.jobId));
    }
    const fleet = event.fleet || event.fleetSnapshot;
    if (fleet && typeof fleet === "object") {
      const agents = Object.values(fleet.agents || {});
      const workflows = Object.values(fleet.workflows || {});
      this.backgroundFleetActive = [...agents, ...workflows].some((run) => ACTIVE_FLEET_STATUSES.has(String(run?.status || "")));
    }
  }

  hasBackgroundWork() {
    return this.backgroundFleetActive || this.managedJobIds.size > 0;
  }

  replay(afterSequence) {
    return this.events.filter((entry) => entry.sequence > afterSequence);
  }

  summary() {
    return {
      sessionKey: this.sessionKey,
      clients: [...this.clients].map((client) => ({ clientId: client.clientId, surface: client.surface })),
      activeRequests: this.activeRequests,
      activeRequestContext: this.activeRequestContext,
      latestTurn: this.latestTurn ? { ...this.latestTurn } : null,
      attention: this.pendingApprovalRequestIds.size > 0 ? "approval" : null,
      backgroundWorkActive: this.hasBackgroundWork(),
      latestSequence: this.sequence,
      alive: this.worker.isAlive()
    };
  }

  scheduleIdleStop() {
    if (this.disposed || this.clients.size > 0 || this.activeRequests > 0 || this.hasBackgroundWork() || this.idleTimer) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.clients.size > 0 || this.activeRequests > 0 || this.hasBackgroundWork()) return;
      this.dispose("Detached session reached its idle timeout.");
      this.server.removeSession(this);
    }, this.idleTimeoutMs);
    this.idleTimer.unref?.();
  }

  dispose(reason) {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.idleTimer);
    this.worker.dispose(reason);
    for (const client of this.clients) client.attachedSessionIds.delete(this.sessionKey);
    this.clients.clear();
    this.controlOwners.clear();
  }
}
