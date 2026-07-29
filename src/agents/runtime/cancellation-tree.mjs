import { execFile } from "node:child_process";

export class CancellationTree {
  constructor() {
    this.nodes = new Map();
  }

  create(id, parentId = null) {
    if (this.nodes.has(id)) throw new Error(`Cancellation node already exists: ${id}.`);
    if (parentId && !this.nodes.has(parentId)) throw new Error(`Cancellation parent not found: ${parentId}.`);
    const controller = new AbortController();
    const node = { id, parentId, controller, children: new Set(), cleanup: new Set() };
    this.nodes.set(id, node);
    if (parentId) {
      const parent = this.nodes.get(parentId);
      parent.children.add(id);
      if (parent.controller.signal.aborted) controller.abort(parent.controller.signal.reason);
    }
    return node;
  }

  signal(id) {
    return this.nodes.get(id)?.controller.signal;
  }

  addCleanup(id, cleanup) {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`Cancellation node not found: ${id}.`);
    node.cleanup.add(cleanup);
    return () => node.cleanup.delete(cleanup);
  }

  async cancel(id, reason = "cancelled") {
    const node = this.nodes.get(id);
    if (!node) return;
    node.controller.abort(reason);
    await Promise.allSettled([...node.children].map((childId) => this.cancel(childId, reason)));
    await Promise.allSettled([...node.cleanup].map((cleanup) => Promise.resolve().then(() => cleanup(reason))));
  }

  remove(id) {
    const node = this.nodes.get(id);
    if (!node) return;
    this.nodes.get(node.parentId)?.children.delete(id);
    for (const childId of node.children) {
      const child = this.nodes.get(childId);
      if (child) child.parentId = null;
    }
    this.nodes.delete(id);
  }

  async dispose(reason = "fleet disposed") {
    const roots = [...this.nodes.values()].filter((node) => !node.parentId).map((node) => node.id);
    await Promise.allSettled(roots.map((id) => this.cancel(id, reason)));
    this.nodes.clear();
  }
}

export async function terminateOwnedProcess(child, reason = "cancelled") {
  if (!child || child.exitCode !== null || child.killed) return;
  const pid = Number(child.pid);
  if (process.platform === "win32" && Number.isSafeInteger(pid) && pid > 0) {
    await new Promise((resolve) => {
      execFile("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, () => resolve());
    });
    return;
  }
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 1000)),
  ]);
  if (child.exitCode === null && !child.killed) child.kill("SIGKILL");
  void reason;
}
