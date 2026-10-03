// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { Loader } from "../../../../../terminal/src/index.js";
import { theme } from "../theme/theme.js";
import { CountdownTimer } from "./countdown-timer.js";
import { keyText } from "./keybinding-hints.js";
class StatusIndicator extends Loader {
  kind;
  constructor(kind, ui, spinnerColorFn, messageColorFn, message, indicator) {
    super(ui, spinnerColorFn, messageColorFn, message, indicator);
    this.kind = kind;
  }
  dispose() {
    this.stop();
  }
}
class WorkingStatusIndicator extends StatusIndicator {
  constructor(ui, message, indicator) {
    super(
      "working",
      ui,
      (spinner) => theme.fg("accent", spinner),
      (text) => theme.fg("muted", text),
      message,
      indicator
    );
  }
}
class RetryStatusIndicator extends StatusIndicator {
  countdown;
  constructor(ui, attempt, maxAttempts, delayMs) {
    const retryMessage = (seconds) => `Retrying (${attempt}/${maxAttempts}) in ${seconds}s... (${keyText("app.interrupt")} to cancel)`;
    super(
      "retry",
      ui,
      (spinner) => theme.fg("warning", spinner),
      (text) => theme.fg("muted", text),
      retryMessage(Math.ceil(delayMs / 1e3))
    );
    this.countdown = new CountdownTimer(
      delayMs,
      ui,
      (seconds) => {
        this.setMessage(retryMessage(seconds));
      },
      () => {
        this.countdown = void 0;
      }
    );
  }
  dispose() {
    this.countdown?.dispose();
    this.countdown = void 0;
    super.dispose();
  }
}
class CompactionStatusIndicator extends StatusIndicator {
  constructor(ui, reason) {
    const cancelHint = `(${keyText("app.interrupt")} to cancel)`;
    const label = reason === "manual" ? `Compacting context... ${cancelHint}` : `${reason === "overflow" ? "Context overflow detected, " : ""}Auto-compacting... ${cancelHint}`;
    super(
      "compaction",
      ui,
      (spinner) => theme.fg("accent", spinner),
      (text) => theme.fg("muted", text),
      label
    );
  }
}
class BranchSummaryStatusIndicator extends StatusIndicator {
  constructor(ui) {
    super(
      "branchSummary",
      ui,
      (spinner) => theme.fg("accent", spinner),
      (text) => theme.fg("muted", text),
      `Summarizing branch... (${keyText("app.interrupt")} to cancel)`
    );
  }
}
class IdleStatus {
  invalidate() {
  }
  render(width) {
    const emptyLine = " ".repeat(width);
    return [emptyLine, emptyLine];
  }
}
export {
  BranchSummaryStatusIndicator,
  CompactionStatusIndicator,
  IdleStatus,
  RetryStatusIndicator,
  StatusIndicator,
  WorkingStatusIndicator
};
