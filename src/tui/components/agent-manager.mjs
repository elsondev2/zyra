import { buildTerminalTheme } from "../../terminal-theme.mjs";
import { reset, truncatePlain } from "../render-utils.mjs";
import { compactNumber, conciseModel, formatElapsed } from "./subagent-message.mjs";

export function createAgentManagerDialog(controller, options = {}) {
  let resolveResult;
  const result = new Promise((resolve) => { resolveResult = resolve; });
  const component = new AgentManagerComponent(controller, { ...options, onClose: resolveResult });
  return { component, result };
}

export class AgentManagerComponent {
  constructor(controller, options = {}) {
    this.key = "agent-manager";
    this.controller = controller;
    this.theme = buildTerminalTheme(options.theme);
    this.onClose = options.onClose ?? (() => {});
    this.selectedIndex = 0;
    this.detailMode = false;
    this.message = "";
    this.transcript = null;
    this.transcriptLoading = false;
    this.unsubscribe = controller.subscribe(() => this.host?.invalidate({ force: true }));
  }
  setHost(host) { this.host = host; }
  dispose() { this.unsubscribe?.(); }

  render(width = 100) {
    const agents = this.agents();
    if (this.selectedIndex >= agents.length) this.selectedIndex = Math.max(0, agents.length - 1);
    const selected = agents[this.selectedIndex];
    const counts = countStatuses(agents);
    const title = `┌ Agents ${"─".repeat(Math.max(1, width - 10))}`.slice(0, width);
    const footer = truncatePlain("↑↓ select · Enter inspect · l older transcript · s steer · x stop · r retry · Esc close", width);
    const lines = [title, truncatePlain(`│ Active ${counts.active}   Waiting ${counts.waiting}   Completed ${counts.completed}   Failed ${counts.failed}`, width)];
    if (width >= 72 && !this.detailMode) {
      const leftWidth = Math.max(24, Math.floor(width * 0.38));
      lines.push(`├${"─".repeat(leftWidth)}┬${"─".repeat(Math.max(1, width - leftWidth - 2))}`);
      const listRows = agents.slice(0, 12);
      for (let index = 0; index < Math.max(6, listRows.length); index += 1) {
        const run = listRows[index];
        const left = run ? `${index === this.selectedIndex ? "›" : " "} ${run.label ?? run.agentId}  ${run.status}` : "";
        const right = index === 0 && selected ? `Task  ${selected.goal}`
          : index === 2 && selected ? `Recent  ${selected.activity?.summary ?? "No recent activity"}`
            : index === 4 && selected ? `${conciseModel(selected.selectedModel)} · ${selected.effort} · ${compactNumber(selected.usage?.totalTokens)} tokens`
              : "";
        lines.push(`│${pad(left, leftWidth)}│ ${truncatePlain(right, Math.max(1, width - leftWidth - 4))}`);
      }
    } else {
      lines.push(`├${"─".repeat(Math.max(1, width - 1))}`);
      if (!this.detailMode) for (const [index, run] of agents.slice(0, 12).entries()) lines.push(truncatePlain(`│ ${index === this.selectedIndex ? "›" : " "} ${run.label ?? run.agentId} · ${run.status} · ${conciseModel(run.selectedModel)}`, width));
      else if (selected) lines.push(...detailLines(selected, width, this.transcript, this.transcriptLoading));
    }
    if (this.message) lines.push(truncatePlain(`│ ${this.message}`, width));
    lines.push(`└${"─".repeat(Math.max(1, width - 1))}`.slice(0, width), `${this.theme.muted}${footer}${reset}`);
    return lines;
  }

  async handleKeypress(str, key) {
    const agents = this.agents();
    const selected = agents[this.selectedIndex];
    if (key?.name === "escape") {
      if (this.detailMode) { this.detailMode = false; this.host?.invalidate({ force: true }); return; }
      this.onClose(null); return;
    }
    if (key?.name === "up") this.selectedIndex = Math.max(0, this.selectedIndex - 1);
    else if (key?.name === "down") this.selectedIndex = Math.min(Math.max(0, agents.length - 1), this.selectedIndex + 1);
    else if (key?.name === "return" && selected) {
      this.detailMode = !this.detailMode;
      if (this.detailMode) await this.loadTranscript(selected);
    }
    else if (selected && String(str ?? "").toLowerCase() === "x") { await this.controller.stop(selected.agentRunId); this.message = `Stopped ${selected.label}.`; }
    else if (selected && String(str ?? "").toLowerCase() === "r") { await this.controller.retry(selected.agentRunId); this.message = `Retry queued for ${selected.label}.`; }
    else if (selected && String(str ?? "").toLowerCase() === "s") { this.onClose({ action: "steer", agentRunId: selected.agentRunId }); return; }
    else if (selected && this.detailMode && String(str ?? "").toLowerCase() === "l" && this.transcript?.nextBefore != null) await this.loadTranscript(selected, this.transcript.nextBefore);
    this.host?.invalidate({ force: true });
  }

  async loadTranscript(run, before) {
    if (!run.sessionFile) { this.transcript = null; return; }
    this.transcriptLoading = true;
    this.host?.invalidate({ force: true });
    try {
      const page = await this.controller.getTranscript(run.agentRunId, { before, limit: 20 });
      this.transcript = before != null && this.transcript
        ? { ...page, entries: [...page.entries, ...this.transcript.entries] }
        : page;
    } catch (error) {
      this.message = `Transcript: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.transcriptLoading = false;
    }
  }

  agents() { return Object.values(this.controller.snapshot()?.agents ?? {}).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)); }
}

function detailLines(run, width, transcript, transcriptLoading) {
  return [
    `│ ${run.label} · ${run.status}`,
    `│ Task: ${run.goal}`,
    `│ Model: ${run.selectedModel}${run.modelRoute?.fallbackReason ? ` (${run.modelRoute.fallbackReason})` : ""}`,
    `│ Usage: ${compactNumber(run.usage?.totalTokens)} tokens · ${formatElapsed(run.elapsedMs)}`,
    `│ Attempt: ${run.attempt} · Isolation: ${run.isolation}`,
    `│ Worktree: ${run.worktree?.directory ?? "none"}`,
    `│ Transcript: ${run.sessionFile ?? "not linked"}`,
    `│ Result: ${run.result?.text ?? run.error?.message ?? "pending"}`,
    ...(transcriptLoading ? ["│ Loading transcript…"] : []),
    ...(transcript?.nextBefore != null ? ["│ Press l to load older transcript entries"] : []),
    ...(transcript?.entries ?? []).slice(-12).map((entry) => `│ ${transcriptEntryText(entry)}`),
  ].flatMap((line) => wrapLine(line, width));
}

function transcriptEntryText(entry) {
  const message = entry?.message && typeof entry.message === "object" ? entry.message : entry;
  const content = Array.isArray(message?.content) ? message.content : [];
  const text = content.map((part) => part?.type === "text" ? part.text : "").filter(Boolean).join(" ") || message?.text || message?.content || "";
  return `${message?.role ?? entry?.type ?? "entry"}: ${String(text).replace(/\s+/g, " ").trim()}`;
}

function countStatuses(agents) {
  return {
    active: agents.filter((run) => ["starting", "running", "recovering"].includes(run.status)).length,
    waiting: agents.filter((run) => ["queued", "waiting", "blocked"].includes(run.status)).length,
    completed: agents.filter((run) => run.status === "completed").length,
    failed: agents.filter((run) => ["failed", "cancelled", "interrupted"].includes(run.status)).length,
  };
}
function pad(value, width) { return truncatePlain(value, width).padEnd(width); }
function wrapLine(value, width) { const text = String(value); const max = Math.max(8, width - 2); return Array.from({ length: Math.ceil(text.length / max) || 1 }, (_, index) => truncatePlain(`${index ? "│   " : ""}${text.slice(index * max, (index + 1) * max)}`, width)); }
