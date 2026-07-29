import { buildTerminalTheme } from "../../terminal-theme.mjs";
import { reset, truncatePlain } from "../render-utils.mjs";

export class SubagentMessageComponent {
  constructor(key, run, theme) {
    this.key = key;
    this.run = run;
    this.theme = buildTerminalTheme(theme);
  }

  setHost(host) { this.host = host; }
  update(run) { this.run = run; this.host?.invalidate(); }

  render(width = 100) {
    const run = this.run ?? {};
    const active = ["queued", "starting", "running", "waiting", "recovering"].includes(run.status);
    const failed = ["failed", "cancelled", "interrupted", "blocked"].includes(run.status);
    const symbol = active ? "◆" : failed ? "!" : "✓";
    const color = active ? this.theme.accent : failed ? this.theme.error : this.theme.success;
    const model = conciseModel(run.selectedModel);
    const tokens = compactNumber(run.usage?.totalTokens);
    const elapsed = formatElapsed(run.elapsedMs || elapsedFrom(run.startedAt, run.completedAt));
    const fallback = run.modelRoute?.fallback ? " · fallback" : "";
    return [
      "",
      `  ${color}${symbol}${reset} ${this.theme.primary}${truncatePlain(run.label ?? run.agentId ?? "agent", Math.max(12, width - 24))}${reset}  ${this.theme.muted}${run.status ?? "queued"}${reset}`,
      `    ${this.theme.muted}${truncatePlain(run.goal ?? "", Math.max(12, width - 6))}${reset}`,
      `    ${this.theme.muted}${[model, tokens ? `${tokens} tokens` : "", elapsed].filter(Boolean).join(" · ")}${fallback}${reset}`,
      ...(!active && run.sessionFile ? [`    ${this.theme.muted}Enter in /agents opens transcript${reset}`] : []),
    ];
  }
}

export function conciseModel(value) {
  const id = String(value ?? "").split("/").at(-1) ?? "";
  if (id === "gpt-5.6-terra") return "Terra";
  if (id === "gpt-5.6-sol") return "Sol";
  if (id === "gpt-5.6-luna") return "Luna";
  return id.replace(/^gpt-/, "GPT-").replace("-mini", " mini");
}

export function compactNumber(value) {
  const number = Number(value) || 0;
  if (!number) return "";
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}m`;
  if (number >= 1000) return `${(number / 1000).toFixed(1)}k`;
  return String(Math.round(number));
}

export function formatElapsed(ms) {
  const seconds = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  if (!seconds) return "";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function elapsedFrom(start, end) {
  if (!start) return 0;
  const started = Date.parse(start);
  const ended = end ? Date.parse(end) : Date.now();
  return Number.isFinite(started) && Number.isFinite(ended) ? Math.max(0, ended - started) : 0;
}
