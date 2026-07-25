import { buildTerminalTheme } from "../../terminal-theme.mjs";
import { reset, truncatePlain } from "../render-utils.mjs";
import { compactNumber, conciseModel } from "./subagent-message.mjs";

export class WorkflowMessageComponent {
  constructor(key, run, agents = [], theme) {
    this.key = key;
    this.run = run;
    this.agents = agents;
    this.theme = buildTerminalTheme(theme);
  }
  setHost(host) { this.host = host; }
  update(run, agents = this.agents) { this.run = run; this.agents = agents; this.host?.invalidate(); }

  render(width = 100) {
    const run = this.run ?? {};
    const phases = Object.values(run.phases ?? {});
    const completedCalls = Object.values(run.calls ?? {}).filter((call) => ["completed", "cached"].includes(call.status)).length;
    const totalCalls = Math.max(Object.keys(run.calls ?? {}).length, Number(run.projected?.requests) || 0);
    const active = ["queued", "running", "paused", "recovering"].includes(run.status);
    const failed = ["failed", "cancelled", "partial"].includes(run.status);
    const symbol = active ? "◐" : failed ? "!" : "✓";
    const color = active ? this.theme.accent : failed ? this.theme.warning : this.theme.success;
    const phaseText = phases.slice(0, 4).map((phase) => `${phase.phaseId ?? phase.name} ${phase.status === "completed" ? "✓" : phase.status}`).join("  ");
    const models = [...new Set(this.agents.map((agent) => conciseModel(agent.selectedModel)).filter(Boolean))];
    return [
      "",
      `  ${color}${symbol}${reset} ${this.theme.primary}${truncatePlain(run.definitionName ?? "workflow", Math.max(12, width - 28))}${reset}  ${this.theme.muted}${run.status} · ${completedCalls}/${totalCalls || "?"} agents${reset}`,
      phaseText ? `    ${this.theme.muted}${truncatePlain(phaseText, Math.max(12, width - 6))}${reset}` : "",
      `    ${this.theme.muted}${[models.join(" · "), run.usage?.totalTokens ? `${compactNumber(run.usage.totalTokens)} tokens` : ""].filter(Boolean).join(" · ")}${reset}`,
    ].filter((line, index) => index < 2 || line);
  }
}
