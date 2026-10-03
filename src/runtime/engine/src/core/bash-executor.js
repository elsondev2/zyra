// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripAnsi } from "../utils/ansi.js";
import { sanitizeBinaryOutput } from "../utils/shell.js";
import { DEFAULT_MAX_BYTES, truncateTail } from "./tools/truncate.js";
async function executeBashWithOperations(command, cwd, operations, options) {
  const outputChunks = [];
  let outputBytes = 0;
  const maxOutputBytes = DEFAULT_MAX_BYTES * 2;
  let tempFilePath;
  let tempFileStream;
  let totalBytes = 0;
  const ensureTempFile = () => {
    if (tempFilePath) {
      return;
    }
    const id = randomBytes(8).toString("hex");
    tempFilePath = join(tmpdir(), `pi-bash-${id}.log`);
    tempFileStream = createWriteStream(tempFilePath);
    for (const chunk of outputChunks) {
      tempFileStream.write(chunk);
    }
  };
  const decoder = new TextDecoder();
  const onData = (data) => {
    totalBytes += data.length;
    const text = sanitizeBinaryOutput(stripAnsi(decoder.decode(data, { stream: true }))).replace(/\r/g, "");
    if (totalBytes > DEFAULT_MAX_BYTES) {
      ensureTempFile();
    }
    if (tempFileStream) {
      tempFileStream.write(text);
    }
    outputChunks.push(text);
    outputBytes += text.length;
    while (outputBytes > maxOutputBytes && outputChunks.length > 1) {
      const removed = outputChunks.shift();
      outputBytes -= removed.length;
    }
    if (options?.onChunk) {
      options.onChunk(text);
    }
  };
  try {
    const result = await operations.exec(command, cwd, {
      onData,
      signal: options?.signal
    });
    const fullOutput = outputChunks.join("");
    const truncationResult = truncateTail(fullOutput);
    if (truncationResult.truncated) {
      ensureTempFile();
    }
    if (tempFileStream) {
      tempFileStream.end();
    }
    const cancelled = options?.signal?.aborted ?? false;
    return {
      output: truncationResult.truncated ? truncationResult.content : fullOutput,
      exitCode: cancelled ? void 0 : result.exitCode ?? void 0,
      cancelled,
      truncated: truncationResult.truncated,
      fullOutputPath: tempFilePath
    };
  } catch (err) {
    if (options?.signal?.aborted) {
      const fullOutput = outputChunks.join("");
      const truncationResult = truncateTail(fullOutput);
      if (truncationResult.truncated) {
        ensureTempFile();
      }
      if (tempFileStream) {
        tempFileStream.end();
      }
      return {
        output: truncationResult.truncated ? truncationResult.content : fullOutput,
        exitCode: void 0,
        cancelled: true,
        truncated: truncationResult.truncated,
        fullOutputPath: tempFilePath
      };
    }
    if (tempFileStream) {
      tempFileStream.end();
    }
    throw err;
  }
}
export {
  executeBashWithOperations
};
