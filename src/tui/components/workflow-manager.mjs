import { buildTerminalTheme } from "../../terminal-theme.mjs";
import { reset, truncatePlain } from "../render-utils.mjs";
import { compactNumber } from "./subagent-message.mjs";

export function createWorkflowManagerDialog(runtime, options = {}) {
  let resolveResult;
  const result = new Promise((resolve) => { resolveResult = resolve; });
  const component = new WorkflowManagerComponent(runtime, { ...options, onClose: resolveResult });
  return { component, result };
}

export class WorkflowManagerComponent {
  constructor(runtime, options = {}) {
    this.key = "workflow-manager";
    this.runtime = runtime;
    this.theme = buildTerminalTheme(options.theme);
    this.onClose = options.onClose ?? (() => {});
    this.selectedIndex = 0;
    this.detailMode = false;
    this.unsubscribe = runtime.controller?.subscribe?.(() => this.host?.invalidate({ force: true }));
  }
  setHost(host) { this.host = host; }
  dispose() { this.unsubscribe?.(); }
  runs() { return this.runtime.listRuns().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)); }

  render(width = 100) {
    const runs = this.runs();
    if (this.selectedIndex >= runs.length) this.selectedIndex = Math.max(0, runs.length - 1);
    const selected = runs[this.selectedIndex];
    const lines = [`┌ Workflows ${"─".repeat(Math.max(1, width - 13))}`.slice(0, width)];
    if (!this.detailMode) {
      for (const [index, run] of runs.slice(0, 12).entries()) {
        const done = Object.values(run.calls ?? {}).filter((call) => ["completed", "cached"].includes(call.status)).length;
        const total = Object.keys(run.calls ?? {}).length || run.projected?.requests || 0;
        lines.push(truncatePlain(`│ ${index === this.selectedIndex ? "›" : " "} ${run.definitionName.padEnd(24)} ${run.status.padEnd(12)} ${done}/${total} agents`, width));
      }
      if (!runs.length) lines.push("│ No workflow runs yet.");
    } else if (selected) {
      lines.push(`├${"─".repeat(Math.max(1, width - 1))}`.slice(0, width));
      for (const phase of Object.values(selected.phases ?? {})) {
        const calls = Object.values(selected.calls ?? {}).filter((call) => call.phaseId === phase.phaseId);
        const done = calls.filter((call) => ["completed", "cached"].includes(call.status)).length;
        lines.push(truncatePlain(`│ ${phase.status === "completed" ? "✓" : phase.status === "running" ? "◐" : "○"} ${phase.phaseId}  ${done}/${calls.length} agents`, width));
      }
      lines.push(truncatePlain(`│ ${compactNumber(selected.usage?.totalTokens)} tokens · ${selected.cacheHits} cached calls`, width));
    }
    lines.push(`└${"─".repeat(Math.max(1, width - 1))}`.slice(0, width), `${this.theme.muted}${truncatePlain("Enter drill in · p pause · x stop · r restart · s save · Esc close", width)}${reset}`);
    return lines;
  }

  async handleKeypress(str, key) {
    const runs = this.runs();
    const selected = runs[this.selectedIndex];
    if (key?.name === "escape") {
      if (this.detailMode) { this.detailMode = false; this.host?.invalidate({ force: true }); return; }
      this.onClose(null); return;
    }
    if (key?.name === "up") this.selectedIndex = Math.max(0, this.selectedIndex - 1);
    else if (key?.name === "down") this.selectedIndex = Math.min(Math.max(0, runs.length - 1), this.selectedIndex + 1);
    else if (key?.name === "return" && selected) this.detailMode = !this.detailMode;
    else if (selected && String(str).toLowerCase() === "p") selected.status === "paused" ? await this.runtime.resume(selected.workflowRunId) : await this.runtime.pause(selected.workflowRunId);
    else if (selected && String(str).toLowerCase() === "x") await this.runtime.stop(selected.workflowRunId);
    else if (selected && String(str).toLowerCase() === "r") await this.runtime.restart(selected.workflowRunId);
    else if (selected && String(str).toLowerCase() === "s") this.onClose({ action: "save", workflowRunId: selected.workflowRunId });
    this.host?.invalidate({ force: true });
  }
}
