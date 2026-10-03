// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { Type } from "typebox";
import { getOrThrow } from "../types.js";
import { executeShellWithCapture } from "../utils/shell-output.js";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize } from "../utils/truncate.js";
const MAX_TIMEOUT_SECONDS = 2147483647 / 1e3;
const BASH_UPDATE_THROTTLE_MS = 100;
const bashSchema = Type.Object({
  command: Type.String({ description: "Bash command to execute" }),
  timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (optional, no default timeout)" }))
});
function validateTimeout(timeout) {
  if (timeout === void 0) return;
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error("Invalid timeout: must be a finite number of seconds");
  }
  if (timeout > MAX_TIMEOUT_SECONDS) {
    throw new Error(`Invalid timeout: maximum is ${MAX_TIMEOUT_SECONDS} seconds`);
  }
}
function createBashTool(options) {
  return {
    name: "bash",
    label: "bash",
    description: `Execute a bash command in the current working directory. Returns stdout and stderr. Output is truncated to last ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). If truncated, full output is saved to a temp file. Optionally provide a timeout in seconds.`,
    parameters: bashSchema,
    async execute(_toolCallId, { command, timeout }, signal, onUpdate, context) {
      validateTimeout(timeout);
      const { env } = context;
      const execution = {
        command: options?.commandPrefix ? `${options.commandPrefix}
${command}` : command,
        cwd: env.cwd,
        env: {},
        inheritEnv: true
      };
      await options?.prepare?.(execution, context, signal);
      let getLatestProgress;
      let updateTimer;
      let updateDirty = false;
      let lastUpdateAt = 0;
      const emitOutputUpdate = () => {
        if (!onUpdate || !updateDirty || !getLatestProgress) return;
        updateDirty = false;
        lastUpdateAt = Date.now();
        const progress = getLatestProgress();
        onUpdate({
          content: [{ type: "text", text: progress.output }],
          details: {
            truncation: progress.truncation.truncated ? progress.truncation : void 0,
            fullOutputPath: progress.fullOutputPath
          }
        });
      };
      const clearUpdateTimer = () => {
        if (!updateTimer) return;
        clearTimeout(updateTimer);
        updateTimer = void 0;
      };
      const scheduleOutputUpdate = () => {
        if (!onUpdate) return;
        updateDirty = true;
        const delay = BASH_UPDATE_THROTTLE_MS - (Date.now() - lastUpdateAt);
        if (delay <= 0) {
          clearUpdateTimer();
          emitOutputUpdate();
          return;
        }
        updateTimer ??= setTimeout(() => {
          updateTimer = void 0;
          emitOutputUpdate();
        }, delay);
      };
      onUpdate?.({ content: [], details: void 0 });
      try {
        const capture = getOrThrow(
          await executeShellWithCapture(env, execution.command, {
            cwd: execution.cwd,
            env: execution.env,
            inheritEnv: execution.inheritEnv,
            timeout,
            abortSignal: signal,
            returnExecutionErrors: true,
            onChunk: (_chunk, getProgress) => {
              getLatestProgress = getProgress;
              scheduleOutputUpdate();
            }
          })
        );
        clearUpdateTimer();
        getLatestProgress = () => capture;
        updateDirty = true;
        emitOutputUpdate();
        let outputText = capture.output;
        let details;
        if (capture.truncation.truncated) {
          details = { truncation: capture.truncation, fullOutputPath: capture.fullOutputPath };
          const startLine = capture.truncation.totalLines - capture.truncation.outputLines + 1;
          const endLine = capture.truncation.totalLines;
          if (capture.truncation.lastLinePartial) {
            const lastLineSize = formatSize(capture.lastLineBytes);
            outputText += `

[Showing last ${formatSize(capture.truncation.outputBytes)} of line ${endLine} (line is ${lastLineSize}). Full output: ${capture.fullOutputPath}]`;
          } else if (capture.truncation.truncatedBy === "lines") {
            outputText += `

[Showing lines ${startLine}-${endLine} of ${capture.truncation.totalLines}. Full output: ${capture.fullOutputPath}]`;
          } else {
            outputText += `

[Showing lines ${startLine}-${endLine} of ${capture.truncation.totalLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). Full output: ${capture.fullOutputPath}]`;
          }
        }
        const appendStatus = (status) => `${outputText ? `${outputText}

` : ""}${status}`;
        if (capture.cancelled) throw new Error(appendStatus("Command aborted"));
        if (capture.executionError?.code === "timeout") {
          throw new Error(appendStatus(`Command timed out after ${timeout} seconds`), {
            cause: capture.executionError
          });
        }
        if (capture.executionError) throw capture.executionError;
        if (capture.exitCode !== 0 && capture.exitCode !== void 0) {
          throw new Error(appendStatus(`Command exited with code ${capture.exitCode}`));
        }
        return { content: [{ type: "text", text: outputText || "(no output)" }], details };
      } finally {
        clearUpdateTimer();
      }
    }
  };
}
export {
  createBashTool
};
