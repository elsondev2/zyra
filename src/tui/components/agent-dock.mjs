import { buildTerminalTheme } from "../../terminal-theme.mjs";
import { reset, truncatePlain } from "../render-utils.mjs";
import { conciseModel } from "./subagent-message.mjs";

export class AgentDockComponent {
  constructor(options = {}) {
    this.key = "agent-dock";
    this.persistent = true;
    this.focusable = true;
    this.focused = false;
    this.theme = buildTerminalTheme(options.theme);
    this.getSnapshot = options.getSnapshot ?? (() => null);
    this.maxRows = Math.max(1, Math.min(6, Number(options.maxRows) || 3));
    this.selectedIndex = 0;
    this.onInspect = options.onInspect;
  }
  setHost(host) { this.host = host; }
  setFocused(value) { this.focused = Boolean(value); this.host?.invalidate({ fixedOnly: true }); }
  update() { this.host?.invalidate({ fixedOnly: true }); }

  render(width = 100) {
    const snapshot = this.getSnapshot();
    const agents = recentAgents(snapshot);
    const workflows = Object.values(snapshot?.workflows ?? {}).filter((run) => ["queued", "running", "paused", "recovering"].includes(run.status));
    if (!agents.length && !workflows.length) return [];
    if (this.selectedIndex >= agents.length) this.selectedIndex = Math.max(0, agents.length - 1);
    const running = agents.filter((run) => ["starting", "running", "recovering"].includes(run.status)).length;
    const waiting = agents.filter((run) => ["queued", "waiting", "blocked"].includes(run.status)).length;
    const lines = ["", `  ${this.theme.primary}Agents${reset}  ${this.theme.muted}${running} running${waiting ? ` · ${waiting} waiting` : ""}${workflows.length ? ` · ${workflows.length} workflow${workflows.length === 1 ? "" : "s"}` : ""}${reset}`];
    for (const [index, run] of agents.slice(0, this.maxRows).entries()) {
      const selected = this.focused && index === this.selectedIndex;
      const marker = selected ? `${this.theme.accent}›${reset}` : " ";
      const label = truncatePlain(run.label ?? run.agentId ?? "agent", Math.max(8, Math.floor(width * 0.38)));
      const detail = truncatePlain(run.activity?.summary ?? run.goal ?? run.status, Math.max(8, width - label.length - 22));
      lines.push(`  ${marker} ${this.theme.primary}${label}${reset}  ${this.theme.muted}${conciseModel(run.selectedModel)} · ${detail}${reset}`);
    }
    return lines;
  }

  async handleKeypress(_str, key) {
    const agents = recentAgents(this.getSnapshot()).slice(0, this.maxRows);
    if (key?.name === "escape" || key?.name === "up" && this.selectedIndex === 0) return this.host?.focusEditor?.();
    if (key?.name === "up") this.selectedIndex = Math.max(0, this.selectedIndex - 1);
    else if (key?.name === "down") this.selectedIndex = Math.min(Math.max(0, agents.length - 1), this.selectedIndex + 1);
    else if (key?.name === "return" && agents[this.selectedIndex]) this.onInspect?.(agents[this.selectedIndex]);
    this.host?.invalidate({ fixedOnly: true });
  }
}

function recentAgents(snapshot) {
  return Object.values(snapshot?.agents ?? {})
    .filter((run) => ["queued", "starting", "running", "waiting", "blocked", "recovering"].includes(run.status)
      || Date.now() - Date.parse(run.completedAt ?? 0) < 5 * 60 * 1000)
    .sort((left, right) => activeRank(left.status) - activeRank(right.status) || Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

function activeRank(status) {
  return ["running", "starting", "recovering", "waiting", "queued", "blocked"].indexOf(status) < 0 ? 10 : ["running", "starting", "recovering", "waiting", "queued", "blocked"].indexOf(status);
}
