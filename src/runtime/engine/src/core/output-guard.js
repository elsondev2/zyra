// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
let stdoutTakeoverState;
const RAW_STDOUT_RETRY_DELAY_MS = 10;
let rawStdoutWriteTail = Promise.resolve();
function getRawStdoutWrite() {
  if (stdoutTakeoverState) {
    return stdoutTakeoverState.rawStdoutWrite;
  }
  return process.stdout.write.bind(process.stdout);
}
async function writeRawStdoutChunk(text) {
  while (true) {
    try {
      await new Promise((resolve, reject) => {
        try {
          getRawStdoutWrite()(text, (error) => {
            if (error) reject(error);
            else resolve();
          });
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
      return;
    } catch (error) {
      const writeError = error instanceof Error ? error : new Error(String(error));
      const code = writeError.code;
      if (code !== "ENOBUFS" && code !== "EAGAIN" && code !== "EWOULDBLOCK") {
        throw writeError;
      }
      await new Promise((resolve) => setTimeout(resolve, RAW_STDOUT_RETRY_DELAY_MS));
    }
  }
}
function takeOverStdout() {
  if (stdoutTakeoverState) {
    return;
  }
  const rawStdoutWrite = process.stdout.write.bind(process.stdout);
  const rawStderrWrite = process.stderr.write.bind(process.stderr);
  const originalStdoutWrite = process.stdout.write;
  process.stdout.write = (chunk, encodingOrCallback, callback) => {
    if (typeof encodingOrCallback === "function") {
      return rawStderrWrite(String(chunk), encodingOrCallback);
    }
    return rawStderrWrite(String(chunk), callback);
  };
  stdoutTakeoverState = {
    rawStdoutWrite,
    rawStderrWrite,
    originalStdoutWrite
  };
}
function restoreStdout() {
  if (!stdoutTakeoverState) {
    return;
  }
  process.stdout.write = stdoutTakeoverState.originalStdoutWrite;
  stdoutTakeoverState = void 0;
}
function isStdoutTakenOver() {
  return stdoutTakeoverState !== void 0;
}
function writeRawStdout(text) {
  if (text.length === 0) {
    return;
  }
  rawStdoutWriteTail = rawStdoutWriteTail.then(() => writeRawStdoutChunk(text));
  void rawStdoutWriteTail.catch(() => {
    process.exit(1);
  });
}
async function waitForRawStdoutBackpressure() {
  while (true) {
    const tail = rawStdoutWriteTail;
    await tail;
    if (tail === rawStdoutWriteTail) {
      return;
    }
  }
}
async function flushRawStdout() {
  await waitForRawStdoutBackpressure();
  await writeRawStdoutChunk("");
}
export {
  flushRawStdout,
  isStdoutTakenOver,
  restoreStdout,
  takeOverStdout,
  waitForRawStdoutBackpressure,
  writeRawStdout
};
