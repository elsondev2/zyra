import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class WorktreeManager {
  constructor(options = {}) {
    this.project = path.resolve(options.project ?? process.cwd());
    this.root = path.resolve(options.root ?? path.join(this.project, ".zyra", "agent-worktrees"));
    this.records = new Map();
  }

  async create(runId, options = {}) {
    const gitRoot = (await git(this.project, ["rev-parse", "--show-toplevel"])).trim();
    const baseCommit = String(options.baseCommit ?? (await git(gitRoot, ["rev-parse", "HEAD"]))).trim();
    const safeId = safeSegment(runId);
    const fleet = safeSegment(options.fleetId ?? "fleet").slice(0, 16);
    const directory = path.join(this.root, fleet, safeId);
    const branch = `zyra-agent/${fleet}/${safeId}`;
    await mkdir(path.dirname(directory), { recursive: true });
    await git(gitRoot, ["worktree", "add", "-b", branch, directory, baseCommit]);
    await writeFile(path.join(directory, ".zyra-agent-worktree.lock"), `${JSON.stringify({ runId, branch, baseCommit, createdAt: new Date().toISOString() })}\n`, { mode: 0o600 });
    const record = { runId, gitRoot, directory, branch, baseCommit, status: "active", createdAt: new Date().toISOString() };
    this.records.set(runId, record);
    return { ...record };
  }

  async inspect(runId) {
    const record = this.records.get(runId);
    if (!record) throw new Error(`Worktree record not found: ${runId}.`);
    const output = await git(record.directory, ["status", "--porcelain=v1"]);
    const changedFiles = output.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).trim()).filter(Boolean);
    return { ...record, changedFiles, dirty: changedFiles.length > 0 };
  }

  markRetained(runId, reason = "awaiting explicit integration") {
    const record = this.records.get(runId);
    if (!record) return null;
    const next = { ...record, status: "retained", retainedReason: reason, completedAt: new Date().toISOString() };
    this.records.set(runId, next);
    return next;
  }

  restore(records = []) {
    for (const record of records) if (record?.runId && record?.directory) this.records.set(record.runId, { ...record });
  }

  list() {
    return [...this.records.values()].map((record) => ({ ...record }));
  }
}

async function git(cwd, args) {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    const detail = String(error?.stderr ?? error?.message ?? error).trim();
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }
}

function safeSegment(value) {
  const text = String(value ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!text) throw new Error("Worktree id is invalid.");
  return text.slice(0, 48);
}
