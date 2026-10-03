// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { setKittyProtocolActive } from "./keys.js";
import { isNativeModifierPressed } from "./native-modifiers.js";
import { getNativeModuleCandidates } from "./native-module-path.js";
import { StdinBuffer } from "./stdin-buffer.js";
const cjsRequire = createRequire(import.meta.url);
const TERMINAL_PROGRESS_KEEPALIVE_MS = 1e3;
const TERMINAL_PROGRESS_ACTIVE_SEQUENCE = "\x1B]9;4;3\x07";
const TERMINAL_PROGRESS_CLEAR_SEQUENCE = "\x1B]9;4;0\x07";
const NATIVE_SHIFT_ENTER_SEQUENCE = "\x1B[13;2u";
const DESIRED_KITTY_KEYBOARD_PROTOCOL_FLAGS = 7;
const KEYBOARD_PROTOCOL_RESPONSE_FRAGMENT_TIMEOUT_MS = 150;
const KITTY_KEYBOARD_PROTOCOL_QUERY = `\x1B[>${DESIRED_KITTY_KEYBOARD_PROTOCOL_FLAGS}u\x1B[?u\x1B[c`;
function parseKeyboardProtocolNegotiationSequence(sequence) {
  const kittyFlags = sequence.match(/^\x1b\[\?(\d+)u$/);
  if (kittyFlags) {
    return { type: "kitty-flags", flags: Number.parseInt(kittyFlags[1], 10) };
  }
  if (/^\x1b\[\?[\d;]*c$/.test(sequence)) {
    return { type: "device-attributes" };
  }
  return void 0;
}
function isKeyboardProtocolNegotiationSequencePrefix(sequence) {
  return sequence === "\x1B[" || /^\x1b\[\?[\d;]*$/.test(sequence);
}
function isAppleTerminalSession() {
  return process.platform === "darwin" && process.env.TERM_PROGRAM === "Apple_Terminal";
}
function normalizeNativeShiftEnterInput(data, shouldDetectNativeShiftEnter, isShiftPressed) {
  if (shouldDetectNativeShiftEnter && data === "\r" && isShiftPressed) return NATIVE_SHIFT_ENTER_SEQUENCE;
  return data;
}
function normalizeAppleTerminalInput(data, isAppleTerminal, isShiftPressed) {
  return normalizeNativeShiftEnterInput(data, isAppleTerminal, isShiftPressed);
}
const DEFAULT_ESCAPE_TIMEOUT_MS = 10;
const DEFAULT_SSH_ESCAPE_TIMEOUT_MS = 100;
function resolveEscapeTimeoutMs(env = process.env) {
  const configured = Number(env.ZYRA_TUI_ESC_TIMEOUT);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  if (env.SSH_CONNECTION || env.SSH_TTY) {
    return DEFAULT_SSH_ESCAPE_TIMEOUT_MS;
  }
  return DEFAULT_ESCAPE_TIMEOUT_MS;
}
class ProcessTerminal {
  wasRaw = false;
  inputHandler;
  resizeHandler;
  _kittyProtocolActive = false;
  _modifyOtherKeysActive = false;
  keyboardProtocolPushed = false;
  keyboardProtocolNegotiationBuffer = "";
  keyboardProtocolBufferFlushTimer;
  stdinBuffer;
  stdinDataHandler;
  progressInterval;
  writeLogPath = (() => {
    const env = process.env.ZYRA_TUI_WRITE_LOG || "";
    if (!env) return "";
    try {
      if (fs.statSync(env).isDirectory()) {
        const now = /* @__PURE__ */ new Date();
        const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}-${String(now.getSeconds()).padStart(2, "0")}`;
        return path.join(env, `tui-${ts}-${process.pid}.log`);
      }
    } catch {
    }
    return env;
  })();
  get kittyProtocolActive() {
    return this._kittyProtocolActive;
  }
  get modifyOtherKeysActive() {
    return this._modifyOtherKeysActive;
  }
  start(onInput, onResize) {
    this.inputHandler = onInput;
    this.resizeHandler = onResize;
    this.wasRaw = process.stdin.isRaw || false;
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }
    process.stdin.setEncoding("utf8");
    process.stdin.resume();
    process.stdout.write("\x1B[?2004h");
    process.stdout.on("resize", this.resizeHandler);
    if (process.platform !== "win32") {
      process.kill(process.pid, "SIGWINCH");
    }
    this.enableWindowsVTInput();
    this.queryAndEnableKittyProtocol();
  }
  /**
   * Set up StdinBuffer to split batched input into individual sequences.
   * This ensures components receive single events, making matchesKey/isKeyRelease work correctly.
   *
   * Also watches for Kitty protocol response and enables it when detected.
   * This is done here (after stdinBuffer parsing) rather than on raw stdin
   * to handle the case where the response arrives split across multiple events.
   */
  setupStdinBuffer() {
    this.stdinBuffer = new StdinBuffer({ escapeTimeout: resolveEscapeTimeoutMs() });
    this.stdinBuffer.on("data", (sequence) => {
      const negotiationSequence = this.readKeyboardProtocolNegotiationSequence(sequence);
      if (negotiationSequence === "pending") {
        this.scheduleKeyboardProtocolNegotiationBufferFlush();
        return;
      }
      if (this.handleKeyboardProtocolNegotiationSequence(negotiationSequence)) {
        return;
      }
      this.forwardInputSequence(sequence);
    });
    this.stdinBuffer.on("paste", (content) => {
      if (this.inputHandler) {
        this.inputHandler(`\x1B[200~${content}\x1B[201~`);
      }
    });
    this.stdinDataHandler = (data) => {
      this.stdinBuffer.process(data);
    };
  }
  /**
   * Query terminal for Kitty keyboard protocol support and enable it if available.
   *
   * Kitty's progressive enhancement detection requires requesting the desired
   * flags before querying them. The trailing DA query is a sentinel supported by
   * terminals that do not know Kitty keyboard protocol; receiving DA before a
   * Kitty response enables modifyOtherKeys fallback without a startup timeout.
   *
   * The requested flags are:
   * - 1 = disambiguate escape codes
   * - 2 = report event types (press/repeat/release)
   * - 4 = report alternate keys (shifted key, base layout key)
   */
  queryAndEnableKittyProtocol() {
    this.setupStdinBuffer();
    process.stdin.on("data", this.stdinDataHandler);
    this.keyboardProtocolPushed = true;
    this.clearKeyboardProtocolNegotiationBuffer();
    process.stdout.write(KITTY_KEYBOARD_PROTOCOL_QUERY);
  }
  handleKeyboardProtocolNegotiationSequence(negotiationSequence) {
    if (!negotiationSequence) return false;
    this.clearKeyboardProtocolNegotiationBuffer();
    if (negotiationSequence.type === "kitty-flags") {
      if (negotiationSequence.flags !== 0) {
        this.disableModifyOtherKeys();
        if (!this._kittyProtocolActive) {
          this._kittyProtocolActive = true;
          setKittyProtocolActive(true);
        }
      } else {
        this.enableModifyOtherKeys();
      }
      return true;
    }
    if (!this._kittyProtocolActive) {
      this.enableModifyOtherKeys();
    }
    return true;
  }
  readKeyboardProtocolNegotiationSequence(sequence) {
    if (this.keyboardProtocolNegotiationBuffer) {
      const bufferedSequence = this.keyboardProtocolNegotiationBuffer + sequence;
      const negotiationSequence2 = parseKeyboardProtocolNegotiationSequence(bufferedSequence);
      if (negotiationSequence2) {
        this.clearKeyboardProtocolNegotiationBuffer();
        return negotiationSequence2;
      }
      if (isKeyboardProtocolNegotiationSequencePrefix(bufferedSequence)) {
        this.setKeyboardProtocolNegotiationBuffer(bufferedSequence);
        return "pending";
      }
      this.flushKeyboardProtocolNegotiationBufferAsInput();
    }
    const negotiationSequence = parseKeyboardProtocolNegotiationSequence(sequence);
    if (negotiationSequence) return negotiationSequence;
    if (isKeyboardProtocolNegotiationSequencePrefix(sequence)) {
      this.setKeyboardProtocolNegotiationBuffer(sequence);
      return "pending";
    }
    return void 0;
  }
  setKeyboardProtocolNegotiationBuffer(sequence) {
    this.clearKeyboardProtocolNegotiationBufferFlushTimer();
    this.keyboardProtocolNegotiationBuffer = sequence;
  }
  clearKeyboardProtocolNegotiationBuffer() {
    this.clearKeyboardProtocolNegotiationBufferFlushTimer();
    this.keyboardProtocolNegotiationBuffer = "";
  }
  flushKeyboardProtocolNegotiationBufferAsInput() {
    if (!this.keyboardProtocolNegotiationBuffer) return;
    const sequence = this.keyboardProtocolNegotiationBuffer;
    this.clearKeyboardProtocolNegotiationBuffer();
    this.forwardInputSequence(sequence);
  }
  scheduleKeyboardProtocolNegotiationBufferFlush() {
    if (!this.keyboardProtocolNegotiationBuffer || this.keyboardProtocolBufferFlushTimer) return;
    this.keyboardProtocolBufferFlushTimer = setTimeout(() => {
      this.keyboardProtocolBufferFlushTimer = void 0;
      this.flushKeyboardProtocolNegotiationBufferAsInput();
    }, KEYBOARD_PROTOCOL_RESPONSE_FRAGMENT_TIMEOUT_MS);
  }
  clearKeyboardProtocolNegotiationBufferFlushTimer() {
    if (!this.keyboardProtocolBufferFlushTimer) return;
    clearTimeout(this.keyboardProtocolBufferFlushTimer);
    this.keyboardProtocolBufferFlushTimer = void 0;
  }
  forwardInputSequence(sequence) {
    if (!this.inputHandler) return;
    const shouldDetectNativeShiftEnter = sequence === "\r" && (isAppleTerminalSession() || process.platform === "win32");
    const input = normalizeNativeShiftEnterInput(
      sequence,
      shouldDetectNativeShiftEnter,
      shouldDetectNativeShiftEnter && isNativeModifierPressed("shift")
    );
    this.inputHandler(input);
  }
  enableModifyOtherKeys() {
    if (this._kittyProtocolActive || this._modifyOtherKeysActive) return;
    process.stdout.write("\x1B[>4;2m");
    this._modifyOtherKeysActive = true;
  }
  disableModifyOtherKeys() {
    if (!this._modifyOtherKeysActive) return;
    process.stdout.write("\x1B[>4;0m");
    this._modifyOtherKeysActive = false;
  }
  /**
   * On Windows, add ENABLE_VIRTUAL_TERMINAL_INPUT (0x0200) to the stdin
   * console handle so the terminal sends VT sequences for modified keys
   * (e.g. \x1b[Z for Shift+Tab). Without this, libuv's ReadConsoleInputW
   * discards modifier state and Shift+Tab arrives as plain \t.
   */
  enableWindowsVTInput() {
    if (process.platform !== "win32") return;
    try {
      const arch = process.arch;
      if (arch !== "x64" && arch !== "arm64") return;
      const nativePath = path.join("native", "win32", "prebuilds", `win32-${arch}`, "win32-console-mode.node");
      for (const modulePath of getNativeModuleCandidates(nativePath)) {
        try {
          const helper = cjsRequire(modulePath);
          helper.enableVirtualTerminalInput?.();
          return;
        } catch {
        }
      }
    } catch {
    }
  }
  async drainInput(maxMs = 1e3, idleMs = 50) {
    const shouldDisableKittyProtocol = this.keyboardProtocolPushed || this._kittyProtocolActive;
    this.clearKeyboardProtocolNegotiationBuffer();
    if (shouldDisableKittyProtocol) {
      process.stdout.write("\x1B[<u");
      this.keyboardProtocolPushed = false;
      this._kittyProtocolActive = false;
      setKittyProtocolActive(false);
    }
    this.disableModifyOtherKeys();
    const previousHandler = this.inputHandler;
    this.inputHandler = void 0;
    let lastDataTime = Date.now();
    const onData = () => {
      lastDataTime = Date.now();
    };
    process.stdin.on("data", onData);
    const endTime = Date.now() + maxMs;
    try {
      while (true) {
        const now = Date.now();
        const timeLeft = endTime - now;
        if (timeLeft <= 0) break;
        if (now - lastDataTime >= idleMs) break;
        await new Promise((resolve) => setTimeout(resolve, Math.min(idleMs, timeLeft)));
      }
    } finally {
      process.stdin.removeListener("data", onData);
      this.inputHandler = previousHandler;
    }
  }
  stop() {
    if (this.clearProgressInterval()) {
      process.stdout.write(TERMINAL_PROGRESS_CLEAR_SEQUENCE);
    }
    process.stdout.write("\x1B[?2004l");
    const shouldDisableKittyProtocol = this.keyboardProtocolPushed || this._kittyProtocolActive;
    this.clearKeyboardProtocolNegotiationBuffer();
    if (shouldDisableKittyProtocol) {
      process.stdout.write("\x1B[<u");
      this.keyboardProtocolPushed = false;
      this._kittyProtocolActive = false;
      setKittyProtocolActive(false);
    }
    this.disableModifyOtherKeys();
    if (this.stdinBuffer) {
      this.stdinBuffer.destroy();
      this.stdinBuffer = void 0;
    }
    if (this.stdinDataHandler) {
      process.stdin.removeListener("data", this.stdinDataHandler);
      this.stdinDataHandler = void 0;
    }
    this.inputHandler = void 0;
    if (this.resizeHandler) {
      process.stdout.removeListener("resize", this.resizeHandler);
      this.resizeHandler = void 0;
    }
    process.stdin.pause();
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(this.wasRaw);
    }
  }
  write(data) {
    process.stdout.write(data);
    if (this.writeLogPath) {
      try {
        fs.appendFileSync(this.writeLogPath, data, { encoding: "utf8" });
      } catch {
      }
    }
  }
  get columns() {
    return process.stdout.columns || Number(process.env.COLUMNS) || 80;
  }
  get rows() {
    return process.stdout.rows || Number(process.env.LINES) || 24;
  }
  moveBy(lines) {
    if (lines > 0) {
      process.stdout.write(`\x1B[${lines}B`);
    } else if (lines < 0) {
      process.stdout.write(`\x1B[${-lines}A`);
    }
  }
  hideCursor() {
    process.stdout.write("\x1B[?25l");
  }
  showCursor() {
    process.stdout.write("\x1B[?25h");
  }
  clearLine() {
    process.stdout.write("\x1B[K");
  }
  clearFromCursor() {
    process.stdout.write("\x1B[J");
  }
  clearScreen() {
    process.stdout.write("\x1B[2J\x1B[H");
  }
  setTitle(title) {
    process.stdout.write(`\x1B]0;${title}\x07`);
  }
  setProgress(active) {
    if (active) {
      process.stdout.write(TERMINAL_PROGRESS_ACTIVE_SEQUENCE);
      if (!this.progressInterval) {
        this.progressInterval = setInterval(() => {
          process.stdout.write(TERMINAL_PROGRESS_ACTIVE_SEQUENCE);
        }, TERMINAL_PROGRESS_KEEPALIVE_MS);
      }
    } else {
      this.clearProgressInterval();
      process.stdout.write(TERMINAL_PROGRESS_CLEAR_SEQUENCE);
    }
  }
  clearProgressInterval() {
    if (!this.progressInterval) return false;
    clearInterval(this.progressInterval);
    this.progressInterval = void 0;
    return true;
  }
}
export {
  ProcessTerminal,
  isAppleTerminalSession,
  normalizeAppleTerminalInput,
  normalizeNativeShiftEnterInput,
  parseKeyboardProtocolNegotiationSequence,
  resolveEscapeTimeoutMs
};
