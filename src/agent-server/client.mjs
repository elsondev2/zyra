import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { constants as fsConstants, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { getAgentServerPaths } from "./paths.mjs";
import {
  AGENT_SERVER_PROTOCOL_VERSION,
  createAgentServerLineReader,
  writeAgentServerMessage
} from "./protocol.mjs";

const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;
const DEFAULT_ATTACH_TIMEOUT_MS = 65_000;

export class ZyraAgentServerClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.root = path.resolve(options.root || path.resolve(import.meta.dirname, "../.."));
    this.paths = getAgentServerPaths(options);
    this.dataRoot = path.resolve(options.dataRoot || process.env.ZYRA_DATA_ROOT || os.homedir());
    this.clientId = String(options.clientId || `agent-client:${process.pid}`);
    this.surface = String(options.surface || "unknown");
    this.authorities = Array.isArray(options.authorities) ? [...new Set(options.authorities)] : [];
    this.authorityProof = String(options.authorityProof || "");
    this.autoStart = options.autoStart !== false;
    this.socket = null;
    this.cleanupReader = null;
    this.pending = new Map();
    this.nextRequestId = 1;
    this.connectPromise = null;
    this.helloResolve = null;
    this.helloReject = null;
    this.controlHandler = null;
  }

  setControlHandler(handler) {
    this.controlHandler = typeof handler === "function" ? handler : null;
  }

  async connect() {
    if (this.socket?.writable) return;
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.connectInternal().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  async connectInternal() {
    let descriptor = readDescriptor(this.paths.descriptorFile);
    if (!descriptor && this.autoStart) {
      this.startServer();
      descriptor = await waitForDescriptor(this.paths.descriptorFile, DEFAULT_CONNECT_TIMEOUT_MS);
    }
    if (!descriptor) throw Object.assign(new Error("Zyra agent server is not running."), { code: "AGENT_SERVER_UNAVAILABLE" });
    try {
      await this.openSocket(descriptor);
    } catch (error) {
      if (!this.autoStart) throw error;
      this.startServer();
      descriptor = await waitForDescriptor(this.paths.descriptorFile, DEFAULT_CONNECT_TIMEOUT_MS, descriptor.pid);
      await this.openSocket(descriptor);
    }
  }

  async openSocket(descriptor) {
    const socket = net.createConnection(descriptor.endpoint);
    this.socket = socket;
    socket.setNoDelay(true);
    this.cleanupReader = createAgentServerLineReader(
      socket,
      (message) => void this.handleMessage(message),
      (error) => this.emit("protocol-error", error)
    );
    socket.on("error", (error) => {
      this.helloReject?.(error);
      this.rejectPending(error);
    });
    socket.once("close", () => {
      this.cleanupReader?.();
      this.cleanupReader = null;
      if (this.socket === socket) this.socket = null;
      const error = Object.assign(new Error("Zyra agent-server connection closed."), { code: "AGENT_SERVER_DISCONNECTED" });
      this.helloReject?.(error);
      this.rejectPending(error);
      this.emit("disconnect", error);
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.destroy();
        reject(Object.assign(new Error("Timed out authenticating with the Zyra agent server."), { code: "AGENT_SERVER_TIMEOUT" }));
      }, 5_000);
      timer.unref?.();
      this.helloResolve = (value) => {
        clearTimeout(timer);
        resolve(value);
      };
      this.helloReject = (error) => {
        clearTimeout(timer);
        reject(error);
      };
      socket.once("connect", () => {
        writeAgentServerMessage(socket, {
          type: "hello",
          version: AGENT_SERVER_PROTOCOL_VERSION,
          token: descriptor.token,
          clientId: this.clientId,
          surface: this.surface,
          authorities: this.authorities,
          ...(this.authorityProof ? { authorityProof: this.authorityProof } : {})
        });
      });
    });
    this.helloResolve = null;
    this.helloReject = null;
  }

  async request(method, params = {}, options = {}) {
    await this.connect();
    if (!this.socket?.writable) throw Object.assign(new Error("Zyra agent server is disconnected."), { code: "AGENT_SERVER_DISCONNECTED" });
    const id = `request:${process.pid}:${this.nextRequestId++}`;
    return new Promise((resolve, reject) => {
      let timer;
      if (options.timeoutMs) {
        timer = setTimeout(() => {
          this.pending.delete(id);
          reject(Object.assign(new Error(`Agent-server request ${method} timed out.`), { code: "AGENT_SERVER_TIMEOUT" }));
        }, Math.max(100, Number(options.timeoutMs)));
        timer.unref?.();
      }
      this.pending.set(id, { resolve, reject, timer });
      try {
        writeAgentServerMessage(this.socket, { type: "request", id, method, params });
      } catch (error) {
        this.pending.delete(id);
        if (timer) clearTimeout(timer);
        reject(error);
      }
    });
  }

  async attach(params) {
    return this.request("session.attach", params, { timeoutMs: DEFAULT_ATTACH_TIMEOUT_MS });
  }

  async detach(sessionKey) {
    return this.request("session.detach", { sessionKey }, { timeoutMs: 5_000 });
  }

  close() {
    this.cleanupReader?.();
    this.cleanupReader = null;
    this.socket?.destroy();
    this.socket = null;
    this.rejectPending(Object.assign(new Error("Zyra agent-server client closed."), { code: "AGENT_SERVER_DISCONNECTED" }));
  }

  startServer() {
    const entry = path.join(this.root, "src", "agent-server", "main.mjs");
    // Electron's Windows executable exits immediately when launched detached with
    // ignored stdio, so Windows carries Node. Signed macOS/Linux Electron binaries
    // run the same entrypoint with ELECTRON_RUN_AS_NODE.
    const { executable, electronAsNode } = resolveAgentServerNodeLaunch(this.dataRoot);
    const child = spawn(executable, [entry, "--channel", this.paths.channel], {
      cwd: this.root,
      detached: true,
      windowsHide: true,
      stdio: "ignore",
      env: {
        ...process.env,
        ZYRA_ROOT: this.root,
        ZYRA_DATA_ROOT: this.dataRoot,
        ZYRA_STATE_DIR: this.paths.stateDirectory,
        ...(electronAsNode ? { ELECTRON_RUN_AS_NODE: "1" } : {})
      }
    });
    child.once("error", (error) => this.emit("server-start-error", error));
    child.unref();
  }

  async handleMessage(message) {
    if (message?.type === "hello.ok") {
      this.helloResolve?.(message.server || {});
      this.emit("connect", message.server || {});
      return;
    }
    if (message?.type === "catalog.changed") {
      this.emit("catalog-changed", message);
      return;
    }
    if (message?.type === "session.event") {
      this.emit("session-event", message);
      this.emit(`session-event:${message.sessionKey}`, message);
      return;
    }
    if (message?.type === "control.request" || message?.type === "control.cancel") {
      await this.handleControl(message);
      return;
    }
    if (message?.type !== "response" || !message.id) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (pending.timer) clearTimeout(pending.timer);
    if (message.ok) pending.resolve(message.result || {});
    else {
      const error = Object.assign(new Error(message.error?.message || "Agent-server request failed."), message.error || {});
      pending.reject(error);
    }
  }

  async handleControl(message) {
    if (message.type === "control.cancel") {
      this.emit("control-cancel", message);
      return;
    }
    try {
      if (!this.controlHandler) throw Object.assign(new Error("This client does not own desktop control authority."), { code: "CONTROL_DRIVER_UNAVAILABLE", retryable: true });
      const result = await this.controlHandler(message.operation, message);
      writeAgentServerMessage(this.socket, {
        type: "control.response",
        sessionKey: message.sessionKey,
        requestId: message.requestId,
        ok: true,
        result
      });
    } catch (error) {
      writeAgentServerMessage(this.socket, {
        type: "control.response",
        sessionKey: message.sessionKey,
        requestId: message.requestId,
        ok: false,
        error: {
          code: error?.code || "CONTROL_ERROR",
          message: error instanceof Error ? error.message : String(error),
          retryable: Boolean(error?.retryable)
        }
      });
    }
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function resolveAgentServerNodeLaunch(dataRoot) {
  if (!process.versions.electron) return { executable: process.execPath, electronAsNode: false };
  const configured = String(process.env.ZYRA_NODE_EXECUTABLE || "");
  if (configured) return { executable: configured, electronAsNode: false };
  if (process.platform !== "win32") return { executable: process.execPath, electronAsNode: true };
  const packaged = process.resourcesPath ? path.join(process.resourcesPath, "zyra-node", "node.exe") : "";
  return {
    executable: packaged && existsSync(packaged) ? cachePackagedWindowsNode(packaged, dataRoot) : "node",
    electronAsNode: false
  };
}

function cachePackagedWindowsNode(source, dataRoot) {
  const sourceSize = statSync(source).size;
  const directory = path.join(dataRoot, ".zyra", "runtime");
  const target = path.join(directory, `node-${process.versions.node}-${sourceSize}.exe`);
  if (!existsSync(target) || statSync(target).size !== sourceSize) {
    mkdirSync(directory, { recursive: true });
    try { copyFileSync(source, target, fsConstants.COPYFILE_EXCL); }
    catch (error) { if (error?.code !== "EEXIST") throw error; }
  }
  if (!existsSync(target) || statSync(target).size !== sourceSize) throw new Error("Cached Node runtime is incomplete.");
  for (const name of readdirSync(directory)) {
    if (name === path.basename(target) || !/^node-.*\.exe$/i.test(name)) continue;
    try { rmSync(path.join(directory, name), { force: true }); } catch {}
  }
  return target;
}

function readDescriptor(file) {
  try {
    const value = JSON.parse(readFileSync(file, "utf8"));
    return value?.version === AGENT_SERVER_PROTOCOL_VERSION && value.endpoint && value.token ? value : null;
  } catch {
    return null;
  }
}

async function waitForDescriptor(file, timeoutMs, previousPid) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const descriptor = readDescriptor(file);
    if (descriptor && (!previousPid || descriptor.pid !== previousPid || processAlive(descriptor.pid))) return descriptor;
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw Object.assign(new Error("Timed out waiting for the Zyra agent server."), { code: "AGENT_SERVER_TIMEOUT" });
}

function processAlive(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}
