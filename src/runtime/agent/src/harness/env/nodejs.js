// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import {
  access,
  appendFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import {
  ExecutionError,
  err,
  FileError,
  ok,
  toError
} from "../types.js";
const MAX_TIMEOUT_MS = 2147483647;
const MAX_TIMEOUT_SECONDS = MAX_TIMEOUT_MS / 1e3;
const EXIT_STDIO_GRACE_MS = 100;
function resolveTimeoutMs(timeout) {
  if (timeout === void 0) return ok(void 0);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    return err(new ExecutionError("timeout", "Invalid timeout: must be a finite number of seconds"));
  }
  const timeoutMs = timeout * 1e3;
  if (timeoutMs > MAX_TIMEOUT_MS) {
    return err(new ExecutionError("timeout", `Invalid timeout: maximum is ${MAX_TIMEOUT_SECONDS} seconds`));
  }
  return ok(timeoutMs);
}
function resolvePath(cwd, path) {
  let normalized = path;
  if (normalized === "~") {
    normalized = homedir();
  } else if (normalized.startsWith("~/") || process.platform === "win32" && normalized.startsWith("~\\")) {
    normalized = join(homedir(), normalized.slice(2));
  } else if (normalized.startsWith("file://")) {
    try {
      normalized = fileURLToPath(normalized);
    } catch {
    }
  }
  return isAbsolute(normalized) ? resolve(normalized) : resolve(cwd, normalized);
}
function fileKindFromStats(stats) {
  if (stats.isFile()) return "file";
  if (stats.isDirectory()) return "directory";
  if (stats.isSymbolicLink()) return "symlink";
  return void 0;
}
function fileInfoFromStats(path, stats) {
  const kind = fileKindFromStats(stats);
  if (!kind) return err(new FileError("invalid", "Unsupported file type", path));
  return ok({
    name: basename(path),
    path,
    kind,
    size: stats.size,
    mtimeMs: stats.mtimeMs
  });
}
function isNodeError(error) {
  return error instanceof Error && "code" in error;
}
function toFileError(error, fallbackPath) {
  if (error instanceof FileError) return error;
  const cause = toError(error);
  const nodeError = isNodeError(error) ? error : void 0;
  const path = typeof nodeError?.path === "string" ? nodeError.path : fallbackPath;
  if (nodeError) {
    const message = nodeError.message;
    switch (nodeError.code) {
      case "ABORT_ERR":
        return new FileError("aborted", message, path, cause);
      case "ENOENT":
        return new FileError("not_found", message, path, cause);
      case "EACCES":
      case "EPERM":
        return new FileError("permission_denied", message, path, cause);
      case "ENOTDIR":
        return new FileError("not_directory", message, path, cause);
      case "EISDIR":
        return new FileError("is_directory", message, path, cause);
      case "EINVAL":
        return new FileError("invalid", message, path, cause);
    }
  }
  return new FileError("unknown", cause.message, path, cause);
}
function abortResult(signal, path) {
  return signal?.aborted ? err(new FileError("aborted", "aborted", path)) : void 0;
}
async function pathExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
async function runCommand(command, args, timeoutMs) {
  return await new Promise((resolve2) => {
    let stdout = "";
    let child;
    try {
      child = spawn(command, args, {
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true
      });
    } catch {
      resolve2({ stdout: "", status: null });
      return;
    }
    const timeout = setTimeout(() => {
      if (child.pid) killProcessTree(child.pid);
    }, timeoutMs);
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", () => {
      clearTimeout(timeout);
      resolve2({ stdout: "", status: null });
    });
    child.on("close", (status) => {
      clearTimeout(timeout);
      resolve2({ stdout, status });
    });
  });
}
async function findBashOnPath() {
  const result = process.platform === "win32" ? await runCommand("where", ["bash.exe"], 5e3) : await runCommand("which", ["bash"], 5e3);
  if (result.status !== 0 || !result.stdout) return null;
  const firstMatch = result.stdout.trim().split(/\r?\n/)[0];
  return firstMatch && await pathExists(firstMatch) ? firstMatch : null;
}
function isLegacyWslBashPath(path) {
  const normalized = path.replace(/\//g, "\\").toLowerCase();
  return /^[a-z]:\\windows\\(?:system32|sysnative)\\bash\.exe$/.test(normalized);
}
function getBashShellConfig(shell) {
  return isLegacyWslBashPath(shell) ? { shell, args: ["-s"], commandTransport: "stdin" } : { shell, args: ["-c"] };
}
async function getShellConfig(customShellPath) {
  if (customShellPath) {
    if (await pathExists(customShellPath)) {
      return ok(getBashShellConfig(customShellPath));
    }
    return err(new ExecutionError("shell_unavailable", `Custom shell path not found: ${customShellPath}`));
  }
  if (process.platform === "win32") {
    const candidates = [];
    const programFiles = process.env.ProgramFiles;
    if (programFiles) candidates.push(`${programFiles}\\Git\\bin\\bash.exe`);
    const programFilesX86 = process.env["ProgramFiles(x86)"];
    if (programFilesX86) candidates.push(`${programFilesX86}\\Git\\bin\\bash.exe`);
    for (const candidate of candidates) {
      if (await pathExists(candidate)) {
        return ok(getBashShellConfig(candidate));
      }
    }
    const bashOnPath2 = await findBashOnPath();
    if (bashOnPath2) {
      return ok(getBashShellConfig(bashOnPath2));
    }
    return err(
      new ExecutionError(
        "shell_unavailable",
        `No bash shell found. Options:
  1. Install Git for Windows: https://git-scm.com/download/win
  2. Add your bash to PATH (Cygwin, MSYS2, etc.)
  3. Configure an explicit shellPath

Searched Git Bash in:
${candidates.map((path) => `  ${path}`).join("\n")}`
      )
    );
  }
  if (await pathExists("/bin/bash")) {
    return ok(getBashShellConfig("/bin/bash"));
  }
  const bashOnPath = await findBashOnPath();
  if (bashOnPath) {
    return ok(getBashShellConfig(bashOnPath));
  }
  return ok({ shell: "sh", args: ["-c"] });
}
function getShellEnv(baseEnv, extraEnv, inheritEnv = true) {
  if (!inheritEnv) return { ...extraEnv };
  return {
    ...process.env,
    ...baseEnv,
    ...extraEnv
  };
}
function killProcessTree(pid) {
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/F", "/T", "/PID", String(pid)], {
        stdio: "ignore",
        detached: true,
        windowsHide: true
      });
    } catch {
    }
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
    }
  }
}
function waitForChildProcess(child) {
  return new Promise((resolvePromise, reject) => {
    let settled = false;
    let exited = false;
    let exitCode = null;
    let postExitTimer;
    let stdoutEnded = child.stdout === null;
    let stderrEnded = child.stderr === null;
    const cleanup = () => {
      if (postExitTimer) clearTimeout(postExitTimer);
      child.removeListener("error", onError);
      child.removeListener("exit", onExit);
      child.removeListener("close", onClose);
      child.stdout?.removeListener("end", onStdoutEnd);
      child.stderr?.removeListener("end", onStderrEnd);
      child.stdout?.removeListener("data", onData);
      child.stderr?.removeListener("data", onData);
    };
    const finalize = (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolvePromise(code);
    };
    const maybeFinalizeAfterExit = () => {
      if (exited && stdoutEnded && stderrEnded) finalize(exitCode);
    };
    const armIdleTimer = () => {
      if (postExitTimer) clearTimeout(postExitTimer);
      postExitTimer = setTimeout(() => finalize(exitCode), EXIT_STDIO_GRACE_MS);
    };
    const onData = () => {
      if (exited && !settled) armIdleTimer();
    };
    const onStdoutEnd = () => {
      stdoutEnded = true;
      maybeFinalizeAfterExit();
    };
    const onStderrEnd = () => {
      stderrEnded = true;
      maybeFinalizeAfterExit();
    };
    const onError = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onExit = (code) => {
      exited = true;
      exitCode = code;
      maybeFinalizeAfterExit();
      if (!settled) armIdleTimer();
    };
    const onClose = (code) => finalize(code);
    child.stdout?.once("end", onStdoutEnd);
    child.stderr?.once("end", onStderrEnd);
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("error", onError);
    child.once("exit", onExit);
    child.once("close", onClose);
  });
}
class NodeExecutionEnv {
  cwd;
  shellPath;
  shellEnv;
  activeChildPids = /* @__PURE__ */ new Set();
  constructor(options) {
    this.cwd = options.cwd;
    this.shellPath = options.shellPath;
    this.shellEnv = options.shellEnv;
  }
  async absolutePath(path) {
    return ok(resolvePath(this.cwd, path));
  }
  async joinPath(parts) {
    return ok(join(...parts));
  }
  async exec(command, options) {
    if (options?.abortSignal?.aborted) return err(new ExecutionError("aborted", "aborted"));
    const timeoutMsResult = resolveTimeoutMs(options?.timeout);
    if (!timeoutMsResult.ok) return err(timeoutMsResult.error);
    const timeoutMs = timeoutMsResult.value;
    const cwd = options?.cwd ? resolvePath(this.cwd, options.cwd) : this.cwd;
    const shellConfig = await getShellConfig(this.shellPath);
    if (!shellConfig.ok) return shellConfig;
    try {
      await access(cwd, constants.F_OK);
    } catch (error) {
      const cause = toError(error);
      return err(
        new ExecutionError(
          "spawn_error",
          `Working directory does not exist: ${cwd}
Cannot execute bash commands.`,
          cause
        )
      );
    }
    return await new Promise((resolvePromise) => {
      let stdout = "";
      let stderr = "";
      let settled = false;
      let timedOut = false;
      let callbackError;
      let child;
      let timeoutId;
      const onAbort = () => {
        if (child?.pid) {
          killProcessTree(child.pid);
        }
      };
      const settle = (result) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (options?.abortSignal) options.abortSignal.removeEventListener("abort", onAbort);
        if (child?.pid) this.activeChildPids.delete(child.pid);
        if (settled) return;
        settled = true;
        resolvePromise(result);
      };
      try {
        const commandFromStdin = shellConfig.value.commandTransport === "stdin";
        child = spawn(
          shellConfig.value.shell,
          commandFromStdin ? shellConfig.value.args : [...shellConfig.value.args, command],
          {
            cwd,
            detached: process.platform !== "win32",
            env: getShellEnv(this.shellEnv, options?.env, options?.inheritEnv),
            stdio: [commandFromStdin ? "pipe" : "ignore", "pipe", "pipe"],
            windowsHide: true
          }
        );
        if (child.pid) this.activeChildPids.add(child.pid);
        if (commandFromStdin) {
          child.stdin?.on("error", () => {
          });
          child.stdin?.end(command);
        }
      } catch (error) {
        const cause = toError(error);
        settle(err(new ExecutionError("spawn_error", cause.message, cause)));
        return;
      }
      timeoutId = timeoutMs !== void 0 ? setTimeout(() => {
        timedOut = true;
        if (child?.pid) {
          killProcessTree(child.pid);
        }
      }, timeoutMs) : void 0;
      if (options?.abortSignal) {
        if (options.abortSignal.aborted) {
          onAbort();
        } else {
          options.abortSignal.addEventListener("abort", onAbort, { once: true });
        }
      }
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => {
        stdout += chunk;
        try {
          options?.onStdout?.(chunk);
        } catch (error) {
          const cause = toError(error);
          callbackError = new ExecutionError("callback_error", cause.message, cause);
          onAbort();
        }
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk;
        try {
          options?.onStderr?.(chunk);
        } catch (error) {
          const cause = toError(error);
          callbackError = new ExecutionError("callback_error", cause.message, cause);
          onAbort();
        }
      });
      void waitForChildProcess(child).then(
        (code) => {
          if (callbackError) {
            settle(err(callbackError));
            return;
          }
          if (timedOut) {
            settle(err(new ExecutionError("timeout", `timeout:${options?.timeout}`)));
            return;
          }
          if (options?.abortSignal?.aborted) {
            settle(err(new ExecutionError("aborted", "aborted")));
            return;
          }
          settle(ok({ stdout, stderr, exitCode: code ?? 0 }));
        },
        (error) => settle(err(new ExecutionError("spawn_error", error.message, error)))
      );
    });
  }
  async readTextFile(path, abortSignal) {
    const resolved = resolvePath(this.cwd, path);
    const aborted = abortResult(abortSignal, resolved);
    if (aborted) return aborted;
    try {
      return ok(await readFile(resolved, { encoding: "utf8", signal: abortSignal }));
    } catch (error) {
      return err(toFileError(error, resolved));
    }
  }
  async readTextLines(path, options) {
    const resolved = resolvePath(this.cwd, path);
    const aborted = abortResult(options?.abortSignal, resolved);
    if (aborted) return aborted;
    if (options?.maxLines !== void 0 && options.maxLines <= 0) return ok([]);
    let stream;
    let lineReader;
    try {
      stream = createReadStream(resolved, { encoding: "utf8", signal: options?.abortSignal });
      lineReader = createInterface({ input: stream, crlfDelay: Infinity });
      const lines = [];
      for await (const line of lineReader) {
        const loopAbort = abortResult(options?.abortSignal, resolved);
        if (loopAbort) return loopAbort;
        lines.push(line);
        if (options?.maxLines !== void 0 && lines.length >= options.maxLines) break;
      }
      const afterReadAbort = abortResult(options?.abortSignal, resolved);
      if (afterReadAbort) return afterReadAbort;
      return ok(lines);
    } catch (error) {
      return err(toFileError(error, resolved));
    } finally {
      lineReader?.close();
      stream?.destroy();
    }
  }
  async readBinaryFile(path, abortSignal) {
    const resolved = resolvePath(this.cwd, path);
    const aborted = abortResult(abortSignal, resolved);
    if (aborted) return aborted;
    try {
      return ok(await readFile(resolved, { signal: abortSignal }));
    } catch (error) {
      return err(toFileError(error, resolved));
    }
  }
  async writeFile(path, content, abortSignal) {
    const resolved = resolvePath(this.cwd, path);
    const aborted = abortResult(abortSignal, resolved);
    if (aborted) return aborted;
    try {
      await mkdir(resolve(resolved, ".."), { recursive: true });
      const afterMkdirAbort = abortResult(abortSignal, resolved);
      if (afterMkdirAbort) return afterMkdirAbort;
      await writeFile(resolved, content, { signal: abortSignal });
      return ok(void 0);
    } catch (error) {
      return err(toFileError(error, resolved));
    }
  }
  async appendFile(path, content) {
    const resolved = resolvePath(this.cwd, path);
    try {
      await mkdir(resolve(resolved, ".."), { recursive: true });
      await appendFile(resolved, content);
      return ok(void 0);
    } catch (error) {
      return err(toFileError(error, resolved));
    }
  }
  async renameFile(sourcePath, destinationPath, abortSignal) {
    const source = resolvePath(this.cwd, sourcePath);
    const destination = resolvePath(this.cwd, destinationPath);
    const aborted = abortResult(abortSignal, destination);
    if (aborted) return aborted;
    try {
      await rename(source, destination);
      return ok(void 0);
    } catch (error) {
      return err(toFileError(error, source));
    }
  }
  async fileInfo(path) {
    const resolved = resolvePath(this.cwd, path);
    try {
      return fileInfoFromStats(resolved, await lstat(resolved));
    } catch (error) {
      return err(toFileError(error, resolved));
    }
  }
  async listDir(path, abortSignal) {
    const resolved = resolvePath(this.cwd, path);
    const aborted = abortResult(abortSignal, resolved);
    if (aborted) return aborted;
    try {
      const entries = await readdir(resolved, { withFileTypes: true });
      const infos = [];
      for (const entry of entries) {
        const loopAbort = abortResult(abortSignal, resolved);
        if (loopAbort) return loopAbort;
        const entryPath = resolve(resolved, entry.name);
        try {
          const info = fileInfoFromStats(entryPath, await lstat(entryPath));
          if (info.ok) infos.push(info.value);
        } catch (error) {
          return err(toFileError(error, entryPath));
        }
      }
      return ok(infos);
    } catch (error) {
      return err(toFileError(error, resolved));
    }
  }
  async canonicalPath(path) {
    const resolved = resolvePath(this.cwd, path);
    try {
      return ok(await realpath(resolved));
    } catch (error) {
      return err(toFileError(error, resolved));
    }
  }
  async exists(path) {
    const result = await this.fileInfo(path);
    if (result.ok) return ok(true);
    if (result.error.code === "not_found") return ok(false);
    return err(result.error);
  }
  async createDir(path, options) {
    const resolved = resolvePath(this.cwd, path);
    try {
      await mkdir(resolved, { recursive: options?.recursive ?? true });
      return ok(void 0);
    } catch (error) {
      return err(toFileError(error, resolved));
    }
  }
  async remove(path, options) {
    const resolved = resolvePath(this.cwd, path);
    try {
      await rm(resolved, { recursive: options?.recursive ?? false, force: options?.force ?? false });
      return ok(void 0);
    } catch (error) {
      return err(toFileError(error, resolved));
    }
  }
  async createTempDir(prefix = "tmp-") {
    try {
      return ok(await mkdtemp(join(tmpdir(), prefix)));
    } catch (error) {
      return err(toFileError(error));
    }
  }
  async createTempFile(options) {
    const dir = await this.createTempDir("tmp-");
    if (!dir.ok) return dir;
    const filePath = join(dir.value, `${options?.prefix ?? ""}${randomUUID()}${options?.suffix ?? ""}`);
    try {
      await writeFile(filePath, "");
      return ok(filePath);
    } catch (error) {
      return err(toFileError(error, filePath));
    }
  }
  async cleanup() {
    for (const pid of this.activeChildPids) killProcessTree(pid);
    this.activeChildPids.clear();
  }
}
export {
  NodeExecutionEnv
};
