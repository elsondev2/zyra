import { getQuickJS, shouldInterruptAfterDeadline } from "quickjs-emscripten";
import { compileWorkflowSource } from "./compiler.mjs";

const pending = new Map();
let requestSequence = 1;
let active = false;

process.on("message", (message) => {
  if (message?.type === "response") {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.ok) request.resolve(message.result);
    else request.reject(new Error(message.error || "Workflow host request failed."));
    return;
  }
  if (message?.type === "execute" && !active) {
    active = true;
    void execute(message).then(
      (result) => process.send?.({ type: "result", id: message.id, result }),
      (error) => process.send?.({ type: "error", id: message.id, error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }),
    ).finally(() => { active = false; });
  }
});

async function execute(message) {
  const source = String(message.source ?? "");
  const args = message.args ?? {};
  const limits = message.limits ?? {};
  const compiled = compileWorkflowSource(source, { args, projectedCalls: limits.projectedCalls });
  const QuickJS = await getQuickJS();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(Math.max(4 * 1024 * 1024, Number(limits.memoryBytes) || 64 * 1024 * 1024));
  runtime.setMaxStackSize(Math.max(256 * 1024, Number(limits.stackBytes) || 2 * 1024 * 1024));
  runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + Math.max(50, Number(limits.cpuTimeoutMs) || 5000)));
  const context = runtime.newContext();
  try {
    installHostFunction(context, "__hostAgent", "agent");
    installHostFunction(context, "__hostPhase", "phase");
    context.unwrapResult(context.evalCode(guestPrelude())).dispose();
    const evaluated = context.evalCode(compiled.code, "workflow.mjs");
    const promiseHandle = context.unwrapResult(evaluated);
    try {
      const resolution = context.resolvePromise(promiseHandle);
      runtime.executePendingJobs();
      const resolved = await resolution;
      const valueHandle = context.unwrapResult(resolved);
      try {
        const jsonHandle = context.unwrapResult(context.evalCode("value => JSON.stringify(value)"));
        try {
          const called = context.callFunction(jsonHandle, context.undefined, valueHandle);
          const resultHandle = context.unwrapResult(called);
          try {
            const json = context.getString(resultHandle);
            return json === undefined ? null : JSON.parse(json);
          } finally { resultHandle.dispose(); }
        } finally { jsonHandle.dispose(); }
      } finally { valueHandle.dispose(); }
    } finally { promiseHandle.dispose(); }
  } finally {
    context.dispose();
    runtime.dispose();
  }
}

function installHostFunction(context, name, operation) {
  const handle = context.newFunction(name, (requestHandle) => {
    const requestJson = context.getString(requestHandle);
    const deferred = context.newPromise();
    const id = requestSequence++;
    pending.set(id, {
      resolve(result) {
        const value = context.newString(JSON.stringify(result ?? null));
        try { deferred.resolve(value); } finally { value.dispose(); }
        void deferred.settled.then(() => context.runtime.executePendingJobs());
      },
      reject(error) {
        const value = context.newError(error instanceof Error ? error.message : String(error));
        try { deferred.reject(value); } finally { value.dispose(); }
        void deferred.settled.then(() => context.runtime.executePendingJobs());
      },
    });
    process.send?.({ type: "request", id, operation, request: JSON.parse(requestJson) });
    return deferred.handle;
  });
  try { context.setProp(context.global, name, handle); } finally { handle.dispose(); }
}

function guestPrelude() {
  return `
    let __phaseName = null;
    let __callSequence = 0;
    globalThis.agent = async (prompt, options = {}) => {
      const request = { prompt: String(prompt), options, phase: __phaseName, ordinal: __callSequence++ };
      return JSON.parse(await __hostAgent(JSON.stringify(request)));
    };
    globalThis.parallel = async (tasks, options = {}) => {
      if (!Array.isArray(tasks)) throw new TypeError('parallel() expects an array');
      const concurrency = Math.max(1, Math.min(16, Number(options.concurrency) || tasks.length || 1));
      const results = new Array(tasks.length);
      let cursor = 0;
      let failure;
      const worker = async () => {
        while (cursor < tasks.length && !(failure && options.failFast !== false)) {
          const index = cursor++;
          try { results[index] = await (typeof tasks[index] === 'function' ? tasks[index]() : tasks[index]); }
          catch (error) { failure ||= error; if (options.failFast === false) results[index] = null; }
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
      if (failure && options.failFast !== false) throw failure;
      return results;
    };
    globalThis.pipeline = async (items, mapper, options = {}) => {
      if (!Array.isArray(items) || typeof mapper !== 'function') throw new TypeError('pipeline() expects items and mapper');
      const tasks = items.map((item, index) => async () => mapper(item, index, options.key ? options.key(item) : String(index)));
      return parallel(tasks, { concurrency: options.concurrency, failFast: options.failFast });
    };
    globalThis.phase = async (name, operation) => {
      if (typeof operation !== 'function') throw new TypeError('phase() expects a function');
      const previous = __phaseName;
      __phaseName = String(name);
      await __hostPhase(JSON.stringify({ name: __phaseName, status: 'running' }));
      try {
        const result = await operation();
        await __hostPhase(JSON.stringify({ name: __phaseName, status: 'completed' }));
        return result;
      } catch (error) {
        await __hostPhase(JSON.stringify({ name: __phaseName, status: 'failed', error: String(error && error.message || error) }));
        throw error;
      } finally { __phaseName = previous; }
    };
    const __functionPrototype = Function.prototype;
    const __asyncFunctionPrototype = Object.getPrototypeOf(async function () {});
    Object.defineProperties(globalThis, {
      Date: { value: undefined, writable: false, configurable: false },
      eval: { value: undefined, writable: false, configurable: false },
      Function: { value: undefined, writable: false, configurable: false },
      AsyncFunction: { value: undefined, writable: false, configurable: false },
      WebAssembly: { value: undefined, writable: false, configurable: false },
      fetch: { value: undefined, writable: false, configurable: false },
      XMLHttpRequest: { value: undefined, writable: false, configurable: false },
      WebSocket: { value: undefined, writable: false, configurable: false },
      EventSource: { value: undefined, writable: false, configurable: false },
      process: { value: undefined, writable: false, configurable: false },
      require: { value: undefined, writable: false, configurable: false },
      module: { value: undefined, writable: false, configurable: false },
      exports: { value: undefined, writable: false, configurable: false },
      Deno: { value: undefined, writable: false, configurable: false },
      Bun: { value: undefined, writable: false, configurable: false },
    });
    Object.defineProperty(__functionPrototype, 'constructor', { value: undefined, writable: false, configurable: false });
    Object.defineProperty(__asyncFunctionPrototype, 'constructor', { value: undefined, writable: false, configurable: false });
    Object.defineProperty(Math, 'random', { value: undefined, writable: false, configurable: false });
    Object.freeze(Math);
    Object.freeze(agent); Object.freeze(parallel); Object.freeze(pipeline); Object.freeze(phase);
  `;
}

process.on("disconnect", () => process.exit(0));
