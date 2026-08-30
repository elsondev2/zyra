import { fork, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { terminateOwnedProcess } from "../agents/runtime/cancellation-tree.mjs";
import { assertValidWorkflowSource } from "./validator.mjs";

const workerFile = fileURLToPath(new URL("./sandbox-worker.mjs", import.meta.url));

export class WorkflowSandboxHost {
  constructor(options = {}) {
    this.timeoutMs = Math.max(1000, Number(options.timeoutMs) || 10 * 60 * 1000);
    this.cpuTimeoutMs = Math.max(50, Number(options.cpuTimeoutMs) || 5000);
    this.memoryBytes = Math.max(4 * 1024 * 1024, Number(options.memoryBytes) || 64 * 1024 * 1024);
    this.child = null;
  }

  async execute(input = {}) {
    const validation = assertValidWorkflowSource(input.source, { projectedCalls: input.projectedCalls });
    const childOptions = {
      cwd: input.cwd ?? process.cwd(),
      env: { NODE_ENV: "production", SYSTEMROOT: process.env.SYSTEMROOT, WINDIR: process.env.WINDIR },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      windowsHide: true,
      execArgv: [],
    };
    const child = process.env.ZYRA_STANDALONE === "1"
      ? spawn(process.execPath, ["--internal-workflow-sandbox"], childOptions)
      : fork(workerFile, [], childOptions);
    this.child = child;
    const executionId = 1;
    let timer;
    let abortListener;
    try {
      return await new Promise((resolve, reject) => {
        const fail = (error) => reject(error instanceof Error ? error : new Error(String(error)));
        timer = setTimeout(() => fail(new Error(`Workflow sandbox exceeded ${this.timeoutMs}ms wall timeout.`)), this.timeoutMs);
        timer.unref?.();
        abortListener = () => fail(abortError(input.signal?.reason));
        input.signal?.addEventListener("abort", abortListener, { once: true });
        child.on("error", fail);
        child.on("exit", (code, signal) => {
          if (code !== 0) fail(new Error(`Workflow sandbox exited with code ${code ?? "none"}${signal ? ` (${signal})` : ""}.`));
        });
        child.on("message", (message) => {
          if (message?.type === "request") {
            Promise.resolve(input.onRequest?.(message.operation, message.request)).then(
              (result) => child.connected && child.send({ type: "response", id: message.id, ok: true, result: boundJson(result, 64 * 1024) }),
              (error) => child.connected && child.send({ type: "response", id: message.id, ok: false, error: error instanceof Error ? error.message : String(error) }),
            );
            return;
          }
          if (message?.id !== executionId) return;
          if (message.type === "result") resolve(message.result);
          if (message.type === "error") {
            const error = new Error(message.error || "Workflow sandbox failed.");
            if (message.stack) error.stack = message.stack;
            reject(error);
          }
        });
        child.send({
          type: "execute",
          id: executionId,
          source: input.source,
          args: input.args ?? {},
          limits: { cpuTimeoutMs: this.cpuTimeoutMs, memoryBytes: this.memoryBytes, projectedCalls: validation.projectedCalls },
        });
      });
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", abortListener);
      await terminateOwnedProcess(child, "workflow complete");
      if (this.child === child) this.child = null;
    }
  }

  async stop(reason = "workflow stopped") {
    const child = this.child;
    this.child = null;
    await terminateOwnedProcess(child, reason);
  }
}

function boundJson(value, maxBytes) {
  const text = JSON.stringify(value ?? null);
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new Error(`Workflow host response exceeds ${maxBytes} bytes.`);
  return JSON.parse(text);
}

function abortError(reason) {
  const error = new Error(`Workflow cancelled${reason ? `: ${reason}` : ""}.`);
  error.name = "AbortError";
  return error;
}
