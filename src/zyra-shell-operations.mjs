import { spawn } from "node:child_process";
import { constants, existsSync, statSync } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { prepareWindowsShellSupervisor } from "./windows-shell-supervisor.mjs";

const MAX_TIMEOUT_MS = 2_147_483_647;
const LEGACY_PI_ENVIRONMENT_KEYS = Object.freeze([
  "PI_SESSION_ID",
  "PI_SESSION_FILE",
  "PI_PROVIDER",
  "PI_MODEL",
  "PI_REASONING_LEVEL",
]);

export function createZyraLocalBashOperations(options = {}) {
  const spawnProcess = options.spawnImpl ?? spawn;
  const platform = options.platform ?? process.platform;
  const environment = options.env ?? process.env;
  const shell = resolveBashShellConfig(options.shellPath, { platform, env: environment, exists: options.exists ?? existsSync });

  return {
    async exec(command, cwd, execution = {}) {
      const timeoutMs = resolveTimeoutMs(execution.timeout);
      if (execution.signal?.aborted) throw new Error("aborted");
      try {
        await access(cwd, constants.F_OK);
        if (!statSync(cwd).isDirectory()) throw new Error();
      } catch {
        throw new Error(`Working directory does not exist: ${cwd}\nCannot execute bash commands.`);
      }

      const supervisor = platform === "win32" ? await prepareWindowsShellSupervisor() : undefined;
      if (execution.signal?.aborted) throw new Error("aborted");
      const useStdin = Boolean(supervisor) || shell.commandTransport === "stdin";
      const child = spawnProcess(supervisor || shell.path, supervisor ? [shell.path, String(process.pid)] : useStdin ? shell.args : [...shell.args, String(command)], {
        cwd,
        detached: platform !== "win32",
        env: buildShellEnvironment(environment),
        stdio: [useStdin ? "pipe" : "ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      if (useStdin) {
        child.stdin?.on("error", () => {});
        child.stdin?.end(String(command));
      }

      let timedOut = false;
      let timeoutHandle;
      let stopTask;
      let resolveStopped, rejectStopped;
      const stopped = new Promise((resolve, reject) => { resolveStopped = resolve; rejectStopped = reject; });
      const stopChild = () => {
        if (stopTask) return;
        stopTask = stopShellProcess(child, platform);
        stopTask.then(() => {
          // Once owned processes are gone, inherited pipes must not hold the job open.
          child.stdout?.destroy();
          child.stderr?.destroy();
          resolveStopped(null);
        }, (error) => {
          error.code = "SHELL_CLEANUP_FAILED";
          rejectStopped(error);
        });
      };
      const onAbort = () => stopChild();
      if (execution.signal) {
        if (execution.signal.aborted) onAbort();
        else execution.signal.addEventListener("abort", onAbort, { once: true });
      }
      if (timeoutMs !== undefined) {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          stopChild();
        }, timeoutMs);
      }
      child.stdout?.on("data", execution.onData ?? (() => {}));
      child.stderr?.on("data", execution.onData ?? (() => {}));

      try {
        const exitCode = await Promise.race([waitForChild(child), stopped]);
        await stopTask;
        if (execution.signal?.aborted) throw new Error("aborted");
        if (timedOut) throw new Error(`timeout:${execution.timeout}`);
        return { exitCode };
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        execution.signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}

async function stopShellProcess(child, platform) {
  if (!child.pid) return;
  if (platform === "win32") {
    // Terminating the supervisor closes its kernel job and all descendants,
    // including detached native programs whose intermediate parents exited.
    if (child.exitCode !== null && child.exitCode !== undefined) return;
    await new Promise((resolve, reject) => {
      const finish = error => {
        clearTimeout(timer);
        child.removeListener("exit", onExit);
        error ? reject(error) : resolve();
      };
      const onExit = () => finish();
      const timer = setTimeout(() => finish(new Error("Command process cleanup timed out.")), 8000);
      child.once("exit", onExit);
      if (!child.kill()) finish(new Error("Could not stop the command process job."));
    });
    return;
  }
  try { process.kill(-child.pid, "SIGKILL"); }
  catch { if (!child.kill("SIGKILL") && child.exitCode === null) throw new Error("Could not stop the command process group."); }
}

function resolveBashShellConfig(shellPath, options) {
  const { platform, env, exists } = options;
  if (shellPath) {
    if (!exists(shellPath)) throw new Error(`Custom shell path not found: ${shellPath}`);
    return shellConfiguration(shellPath, platform);
  }
  if (platform === "win32") {
    const candidates = [env.ProgramFiles, env["ProgramFiles(x86)"]]
      .filter(Boolean)
      .map((directory) => path.win32.join(directory, "Git", "bin", "bash.exe"));
    for (const candidate of candidates) {
      if (exists(candidate)) return shellConfiguration(candidate, platform);
    }
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path");
    for (const directory of String(pathKey ? env[pathKey] : "").split(path.win32.delimiter).filter(Boolean)) {
      const candidate = path.win32.join(directory, "bash.exe");
      if (exists(candidate)) return shellConfiguration(candidate, platform);
    }
    throw new Error("No Bash shell found. Install Git for Windows or set shellPath in Zyra settings.");
  }
  if (exists("/bin/bash")) return shellConfiguration("/bin/bash", platform);
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path");
  for (const directory of String(pathKey ? env[pathKey] : "").split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, "bash");
    if (exists(candidate)) return shellConfiguration(candidate, platform);
  }
  return { path: "sh", args: ["-c"] };
}

function shellConfiguration(shellPath, platform) {
  const windowsPath = String(shellPath).replaceAll("/", "\\").toLowerCase();
  const isLegacyWslBash = platform === "win32" && /^[a-z]:\\windows\\(?:system32|sysnative)\\bash\.exe$/.test(windowsPath);
  return isLegacyWslBash
    ? { path: shellPath, args: ["-s"], commandTransport: "stdin" }
    : { path: shellPath, args: ["-c"] };
}

function buildShellEnvironment(environment) {
  const result = { ...environment };
  for (const key of LEGACY_PI_ENVIRONMENT_KEYS) delete result[key];
  return result;
}

function resolveTimeoutMs(timeout) {
  if (timeout === undefined) return undefined;
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error("Invalid timeout: must be a finite number of seconds");
  const timeoutMs = timeout * 1000;
  if (timeoutMs > MAX_TIMEOUT_MS) throw new Error(`Invalid timeout: maximum is ${MAX_TIMEOUT_MS / 1000} seconds`);
  return timeoutMs;
}

function waitForChild(child) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    child.once("error", (error) => finish(reject, error));
    child.once("close", (code) => finish(resolve, code));
  });
}
