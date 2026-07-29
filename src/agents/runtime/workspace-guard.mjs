import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

export class WorkspaceGuard {
  constructor(options = {}) {
    this.project = path.resolve(options.project ?? process.cwd());
    this.locks = new Map();
    this.changedFiles = new Map();
  }

  async normalizeScopes(scopes = []) {
    const normalized = [];
    for (const scope of unique(scopes)) normalized.push(await normalizeProjectPath(this.project, scope));
    return [...new Set(normalized)].sort(comparePaths);
  }

  async acquire(runId, scopes = [], options = {}) {
    const normalized = await this.normalizeScopes(scopes);
    if (!normalized.length) throw new Error("Shared writer requires at least one declared write scope.");
    const timeoutMs = Math.max(0, Number(options.timeoutMs) || 30_000);
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const conflicts = this.findConflicts(runId, normalized);
      if (!conflicts.length) break;
      if (options.wait === false || Date.now() >= deadline) {
        const error = new Error(`Write scope conflicts with ${conflicts.map((item) => item.runId).join(", ")}.`);
        error.code = "WRITE_SCOPE_CONFLICT";
        error.conflicts = conflicts;
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    this.locks.set(runId, normalized);
    return { runId, scopes: normalized, release: () => this.release(runId) };
  }

  release(runId) {
    this.locks.delete(runId);
  }

  findConflicts(runId, scopes) {
    const conflicts = [];
    for (const [owner, ownerScopes] of this.locks) {
      if (owner === runId) continue;
      const overlap = ownerScopes.filter((left) => scopes.some((right) => pathsOverlap(left, right)));
      if (overlap.length) conflicts.push({ runId: owner, paths: overlap });
    }
    return conflicts;
  }

  recordChangedFiles(runId, files = []) {
    const normalized = unique(files).map((file) => path.resolve(this.project, file));
    this.changedFiles.set(runId, normalized);
    return this.detectChangedFileOverlaps(runId);
  }

  detectChangedFileOverlaps(runId) {
    const files = this.changedFiles.get(runId) ?? [];
    const overlaps = [];
    for (const [otherRunId, otherFiles] of this.changedFiles) {
      if (otherRunId === runId) continue;
      const common = files.filter((file) => otherFiles.includes(file));
      if (common.length) overlaps.push({ runId: otherRunId, files: common });
    }
    return overlaps;
  }

  snapshot() {
    return Object.fromEntries([...this.locks].map(([runId, scopes]) => [runId, { scopes }]));
  }
}

export async function normalizeProjectPath(project, value) {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("Write scope path is empty.");
  const projectReal = await safeRealpath(project);
  const absolute = path.resolve(project, raw);
  const resolved = await resolveExistingAncestor(absolute);
  const relative = path.relative(projectReal, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Write scope escapes project: ${raw}.`);
  const stat = await lstatIfExists(absolute);
  if (stat?.isSymbolicLink()) throw new Error(`Symlink write scope is denied: ${raw}.`);
  return path.normalize(absolute);
}

function pathsOverlap(left, right) {
  const a = path.normalize(left).toLowerCase();
  const b = path.normalize(right).toLowerCase();
  return a === b || a.startsWith(`${b}${path.sep}`) || b.startsWith(`${a}${path.sep}`);
}

async function resolveExistingAncestor(value) {
  let current = value;
  const suffix = [];
  while (true) {
    try {
      const real = await realpath(current);
      return path.join(real, ...suffix.reverse());
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      suffix.push(path.basename(current));
      current = parent;
    }
  }
}

async function safeRealpath(value) {
  try { return await realpath(value); } catch { return path.resolve(value); }
}

async function lstatIfExists(value) {
  try { return await lstat(value); } catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}

function unique(value) {
  return [...new Set((Array.isArray(value) ? value : value ? [value] : []).map(String).filter(Boolean))];
}

function comparePaths(left, right) {
  return left.toLowerCase().localeCompare(right.toLowerCase());
}
