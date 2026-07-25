import { createLocalBashOperations } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { DEFAULT_MANAGED_BASH_AUTO_POLL_MS } from "./tool-contracts.mjs";

const DEFAULT_INITIAL_WAIT_MS = 8000;
const DEFAULT_STATUS_WAIT_MS = 5000;
export const DEFAULT_AUTO_POLL_MS = DEFAULT_MANAGED_BASH_AUTO_POLL_MS;
const DEFAULT_MAX_AUTO_POLLS = 20;
const MAX_BUFFER_CHARS = 120000;
const STATUS_OUTPUT_LINES = 80;
const FINAL_OUTPUT_LINES = 2000;
const STATUS_OUTPUT_CHARS = 24000;
const FINAL_OUTPUT_CHARS = 50000;
const LIVE_UPDATE_INTERVAL_MS = 500;

const bashSchema = Type.Object({
  command: Type.Optional(Type.String({ description: "Bash command to execute. Required for action=run." })),
  timeout: Type.Optional(Type.Number({ description: "Timeout in seconds for the command process." })),
  action: Type.Optional(Type.Union([
    Type.Literal("run"),
    Type.Literal("status"),
    Type.Literal("stop"),
  ], { description: "run a command, check a running command, or stop a running command." })),
  jobId: Type.Optional(Type.String({ description: "Managed command job id returned by a long-running command." })),
  wait: Type.Optional(Type.Number({ description: "Seconds to wait before returning a running status update." })),
});

export function createManagedBashState() {
  const state = {
    jobs: new Map(),
    listeners: new Set(),
    nextId: 1,
    abortAll(reason = "Command aborted") {
      for (const job of state.jobs.values()) {
        if (!job.completedAt) stopJob(job, reason);
      }
    },
    hasAutoPollJobs() {
      return hasManagedBashAutoPollJobs(state);
    },
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      state.listeners.add(listener);
      return () => state.listeners.delete(listener);
    },
  };
  return state;
}

export function createManagedBashTool(options = {}) {
  const state = options.state ?? createManagedBashState();
  const operations = createLocalBashOperations({ shellPath: options.shellPath });
  const commandPrefix = String(options.commandPrefix ?? "");
  const cwd = options.cwd ?? process.cwd();

  return {
    name: "bash",
    label: "bash",
    description: "Execute a bash command. Long-running commands may return before completion with a job id; call action=status with that job id to inspect output, or action=stop to stop it.",
    promptSnippet: "Execute bash commands. If a command returns `still running` with a job id, call bash action=status to inspect output before deciding what to do next.",
    parameters: bashSchema,
    async execute(toolCallId, input = {}, signal, onUpdate) {
      const action = normalizeAction(input);
      if (action === "status") return statusAction(state, input, signal);
      if (action === "stop") return stopAction(state, input);
      return runAction({ state, operations, commandPrefix, cwd, toolCallId, input, signal, onUpdate });
    },
  };
}

function normalizeAction(input = {}) {
  const action = String(input.action ?? "").trim().toLowerCase();
  if (action === "status" || action === "stop" || action === "run") return action;
  return input.jobId && !input.command ? "status" : "run";
}

async function runAction({ state, operations, commandPrefix, cwd, toolCallId, input, signal, onUpdate }) {
  const command = String(input.command ?? "").trim();
  if (!command) throw new Error("bash command is required");

  const job = startJob({ state, operations, commandPrefix, cwd, command, toolCallId, timeout: input.timeout, onUpdate });
  const waitMs = secondsToMs(input.wait, DEFAULT_INITIAL_WAIT_MS);
  const abortResult = linkAbort(signal, job);

  try {
    const completed = await waitForJob(job, waitMs, signal);
    if (completed) return finalJobResult(state, job);
    flushLiveUpdate(job);
    job.onUpdate = undefined;
    return runningJobResult(job, { initial: true });
  } finally {
    abortResult.unlink();
  }
}

async function statusAction(state, input = {}, signal) {
  const job = getJob(state, input.jobId);
  const waitMs = secondsToMs(input.wait, job.completedAt ? 0 : DEFAULT_STATUS_WAIT_MS);
  if (!job.completedAt && waitMs > 0) await waitForJob(job, waitMs, signal);
  if (job.completedAt) return finalJobResult(state, job);
  return runningJobResult(job);
}

async function stopAction(state, input = {}) {
  const job = getJob(state, input.jobId);
  stopJob(job, "Command stopped");
  await job.done.catch(() => {});
  state.jobs.delete(job.id);
  return toolResult(formatStoppedJob(job), { jobId: job.id, status: "stopped", outputLineCount: countOutputLines(job.output) });
}

function startJob({ state, operations, commandPrefix, cwd, command, toolCallId, timeout, onUpdate }) {
  const id = `cmd-${state.nextId++}`;
  const abortController = new AbortController();
  const startedAt = Date.now();
  const resolvedCommand = commandPrefix ? `${commandPrefix}\n${command}` : command;
  const job = {
    id,
    toolCallId,
    command,
    startedAt,
    lastOutputAt: undefined,
    completedAt: undefined,
    exitCode: undefined,
    error: undefined,
    output: "",
    abortController,
    stoppedReason: undefined,
    autoPolls: 0,
    autoPollDone: false,
    onUpdate,
    lastLiveUpdateAt: 0,
    liveUpdateTimer: undefined,
    done: undefined,
    state,
  };
  state.jobs.set(id, job);

  job.done = operations.exec(resolvedCommand, cwd, {
    timeout,
    signal: abortController.signal,
    onData(data) {
      appendOutput(job, data);
      scheduleLiveUpdate(job);
    },
  }).then((result) => {
    flushLiveUpdate(job);
    clearLiveUpdateTimer(job);
    job.exitCode = result.exitCode;
    job.completedAt = Date.now();
    emitManagedBashJobUpdate(job);
    return job;
  }).catch((error) => {
    flushLiveUpdate(job);
    clearLiveUpdateTimer(job);
    job.error = error instanceof Error ? error : new Error(String(error));
    job.completedAt = Date.now();
    emitManagedBashJobUpdate(job);
    return job;
  });

  return job;
}

function appendOutput(job, data) {
  const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data ?? "");
  if (!text) return;
  job.lastOutputAt = Date.now();
  job.output += text;
  if (job.output.length > MAX_BUFFER_CHARS) {
    job.output = job.output.slice(job.output.length - MAX_BUFFER_CHARS);
  }
}

function scheduleLiveUpdate(job) {
  if ((!job.onUpdate && job.state.listeners.size === 0) || job.completedAt) return;
  const elapsed = Date.now() - (job.lastLiveUpdateAt || 0);
  if (elapsed >= LIVE_UPDATE_INTERVAL_MS) {
    flushLiveUpdate(job);
    return;
  }
  if (job.liveUpdateTimer) return;
  job.liveUpdateTimer = setTimeout(() => {
    job.liveUpdateTimer = undefined;
    flushLiveUpdate(job);
  }, Math.max(0, LIVE_UPDATE_INTERVAL_MS - elapsed));
}

function flushLiveUpdate(job) {
  if (job.completedAt || !job.output) return;
  if (!job.onUpdate && job.state.listeners.size === 0) return;
  job.lastLiveUpdateAt = Date.now();
  const update = toolResult(outputSnapshot(job.output, STATUS_OUTPUT_CHARS), {
      jobId: job.id,
      status: "running",
      live: true,
      outputLineCount: countOutputLines(job.output),
      startedAt: new Date(job.startedAt).toISOString(),
      lastOutputAt: job.lastOutputAt ? new Date(job.lastOutputAt).toISOString() : undefined,
    });
  if (job.onUpdate) {
    try {
      job.onUpdate(update);
    } catch {
      // Pi live updates are best-effort; the managed job observer remains authoritative.
    }
  }
  notifyManagedBashListeners(job.state, createManagedBashJobSnapshot(job, "running", update.content[0].text));
}

function emitManagedBashJobUpdate(job) {
  const status = job.stoppedReason
    ? "stopped"
    : job.error || (job.exitCode !== 0 && job.exitCode !== null && job.exitCode !== undefined)
      ? "failed"
      : "completed";
  notifyManagedBashListeners(job.state, createManagedBashJobSnapshot(job, status, outputSnapshot(job.output, FINAL_OUTPUT_CHARS)));
}

function createManagedBashJobSnapshot(job, status, output) {
  return {
    jobId: job.id,
    toolCallId: job.toolCallId,
    command: job.command,
    status,
    output,
    startedAt: new Date(job.startedAt).toISOString(),
    lastOutputAt: job.lastOutputAt ? new Date(job.lastOutputAt).toISOString() : undefined,
    completedAt: job.completedAt ? new Date(job.completedAt).toISOString() : undefined,
    exitCode: job.exitCode,
    errorMessage: job.stoppedReason ? undefined : job.error?.message,
  };
}

function notifyManagedBashListeners(state, update) {
  for (const listener of state.listeners) {
    try {
      listener(update);
    } catch {
      // Lifecycle observers must not affect command execution.
    }
  }
}

function clearLiveUpdateTimer(job) {
  if (!job.liveUpdateTimer) return;
  clearTimeout(job.liveUpdateTimer);
  job.liveUpdateTimer = undefined;
}

function outputSnapshot(output, maxChars) {
  const text = String(output ?? "").replace(/\r\n/g, "\n").trimEnd();
  if (!text || text.length <= maxChars) return text;
  return text.slice(text.length - maxChars);
}

function countOutputLines(output) {
  const text = String(output ?? "").replace(/\r\n/g, "\n").trimEnd();
  return text ? text.split("\n").length : 0;
}

function stopJob(job, reason) {
  if (job.completedAt) return;
  job.stoppedReason = reason;
  job.abortController.abort();
}

function getJob(state, jobId) {
  const id = String(jobId ?? "").trim();
  if (!id) throw new Error("jobId is required");
  const job = state.jobs.get(id);
  if (!job) throw new Error(`No managed command found for jobId ${id}`);
  return job;
}

async function waitForJob(job, waitMs, signal) {
  if (job.completedAt) return true;
  const timeout = sleep(waitMs);
  const abort = abortPromise(signal);
  await Promise.race([job.done, timeout, abort]);
  return Boolean(job.completedAt);
}

function linkAbort(signal, job) {
  if (!signal) return { unlink() {} };
  const abort = () => stopJob(job, "Command aborted");
  if (signal.aborted) abort();
  signal.addEventListener?.("abort", abort, { once: true });
  return {
    unlink() {
      signal.removeEventListener?.("abort", abort);
    },
  };
}

function abortPromise(signal) {
  if (!signal) return new Promise(() => {});
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
}

function finalJobResult(state, job) {
  state.jobs.delete(job.id);
  const text = formatFinalJob(job);
  if (job.error || (job.exitCode !== 0 && job.exitCode !== null && job.exitCode !== undefined)) {
    throw new Error(text);
  }
  return toolResult(text, { jobId: job.id, status: "completed", exitCode: job.exitCode, outputLineCount: countOutputLines(job.output) });
}

function runningJobResult(job, options = {}) {
  return toolResult(formatRunningJob(job, options), {
    jobId: job.id,
    status: "running",
    outputLineCount: countOutputLines(job.output),
    startedAt: new Date(job.startedAt).toISOString(),
    lastOutputAt: job.lastOutputAt ? new Date(job.lastOutputAt).toISOString() : undefined,
  });
}

function toolResult(text, details = undefined) {
  return {
    content: [{ type: "text", text }],
    details,
  };
}

export function hasManagedBashAutoPollJobs(state) {
  return [...state.jobs.values()].some((job) => !job.autoPollDone);
}

export async function waitForManagedBashAutoUpdate(state, options = {}) {
  const jobs = [...state.jobs.values()].filter((job) => !job.autoPollDone);
  if (jobs.length === 0) return "";

  const completed = jobs.some((job) => job.completedAt);
  if (!completed) {
    await Promise.race([
      Promise.any(jobs.map((job) => job.done)).catch(() => undefined),
      sleep(options.waitMs ?? DEFAULT_AUTO_POLL_MS),
      abortPromise(options.signal),
    ]);
  }

  const maxPolls = Number.isFinite(Number(options.maxPolls)) ? Number(options.maxPolls) : DEFAULT_MAX_AUTO_POLLS;
  const updates = [];
  for (const job of [...state.jobs.values()]) {
    if (job.autoPollDone) continue;
    if (job.completedAt) {
      updates.push(formatFinalJob(job));
      state.jobs.delete(job.id);
      continue;
    }
    job.autoPolls += 1;
    updates.push(formatRunningJob(job, { auto: true }));
    if (job.autoPolls >= maxPolls) {
      job.autoPollDone = true;
      updates.push(`Auto-poll limit reached for ${job.id}. Leave it running only if useful, or call bash action=status/action=stop with this jobId.`);
    }
  }
  return updates.filter(Boolean).join("\n\n---\n\n");
}

function formatRunningJob(job, options = {}) {
  const elapsed = formatDuration(Date.now() - job.startedAt);
  const lastOutput = job.lastOutputAt ? `${formatDuration(Date.now() - job.lastOutputAt)} ago` : "no output yet";
  const heading = options.initial
    ? `Command still running (${job.id}) after ${elapsed}.`
    : `Command still running (${job.id}). Elapsed: ${elapsed}.`;
  const output = formatOutputTail(job.output, { maxLines: STATUS_OUTPUT_LINES, maxChars: STATUS_OUTPUT_CHARS });
  return [
    heading,
    `Last output: ${lastOutput}`,
    `Command: ${job.command}`,
    "",
    output ? `Current output:\n${output}` : "Current output: (none yet)",
    "",
    `To check again, call bash with action=status and jobId=${job.id}. To stop it, call action=stop with jobId=${job.id}.`,
  ].join("\n");
}

function formatFinalJob(job) {
  const elapsed = formatDuration((job.completedAt ?? Date.now()) - job.startedAt);
  const output = formatOutputTail(job.output, { maxLines: FINAL_OUTPUT_LINES, maxChars: FINAL_OUTPUT_CHARS }) || "(no output)";
  const status = job.stoppedReason
    ? job.stoppedReason
    : job.error
      ? job.error.message
      : job.exitCode === 0 || job.exitCode === null || job.exitCode === undefined
        ? "Command completed"
        : `Command exited with code ${job.exitCode}`;
  return [
    `${status} (${job.id}) after ${elapsed}.`,
    `Command: ${job.command}`,
    "",
    output,
  ].join("\n");
}

function formatStoppedJob(job) {
  const elapsed = formatDuration((job.completedAt ?? Date.now()) - job.startedAt);
  const output = formatOutputTail(job.output, { maxLines: STATUS_OUTPUT_LINES, maxChars: STATUS_OUTPUT_CHARS }) || "(no output)";
  return [`Command stopped (${job.id}) after ${elapsed}.`, `Command: ${job.command}`, "", output].join("\n");
}

function formatOutputTail(output, options = {}) {
  const text = String(output ?? "").replace(/\r\n/g, "\n").trimEnd();
  if (!text) return "";
  const maxChars = options.maxChars ?? STATUS_OUTPUT_CHARS;
  const maxLines = options.maxLines ?? STATUS_OUTPUT_LINES;
  let truncatedByChars = false;
  let sliced = text;
  if (sliced.length > maxChars) {
    sliced = sliced.slice(sliced.length - maxChars);
    truncatedByChars = true;
  }
  const lines = sliced.split("\n");
  const overflowLines = Math.max(0, lines.length - maxLines);
  const visible = overflowLines > 0 ? lines.slice(lines.length - maxLines) : lines;
  const prefix = truncatedByChars || overflowLines > 0
    ? `[Showing latest output${overflowLines > 0 ? `, skipped ${overflowLines} earlier line${overflowLines === 1 ? "" : "s"}` : ""}]\n`
    : "";
  return `${prefix}${visible.join("\n")}`;
}

function secondsToMs(value, fallbackMs) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallbackMs;
  return Math.round(number * 1000);
}

function sleep(ms) {
  const duration = Math.max(0, Number(ms) || 0);
  return new Promise((resolve) => setTimeout(resolve, duration));
}

function formatDuration(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}
