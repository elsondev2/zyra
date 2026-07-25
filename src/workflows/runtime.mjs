import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { normalizeWorkflowRun, TERMINAL_WORKFLOW_STATES } from "../agents/contracts.mjs";
import { assertWorkflowApproved, evaluateWorkflowApproval } from "./approval.mjs";
import { estimateWorkflowProjection } from "./builtins.mjs";
import { normalizeWorkflowBudget } from "./contracts.mjs";
import { discoverWorkflowDefinitions } from "./loader.mjs";
import { WorkflowSandboxHost } from "./sandbox-host.mjs";
import { WorkflowScheduler } from "./scheduler.mjs";

export class WorkflowRuntime {
  constructor(options = {}) {
    this.controller = options.controller;
    this.eventStore = options.eventStore ?? options.controller?.eventStore;
    this.project = path.resolve(options.project ?? options.controller?.project ?? process.cwd());
    this.projectTrusted = Boolean(options.projectTrusted);
    this.definitions = { active: [], shadowed: [], all: [] };
    this.active = new Map();
    this.temporary = [];
    this.installRoot = options.installRoot;
  }

  async initialize() {
    await this.reloadDefinitions();
    return this;
  }

  async reloadDefinitions() {
    this.definitions = await discoverWorkflowDefinitions({
      installRoot: this.installRoot,
      project: this.project,
      projectTrusted: this.projectTrusted,
      temporary: this.temporary,
    });
    return this.definitions;
  }

  listDefinitions() {
    return this.definitions;
  }

  listRuns() {
    return Object.values(this.controller.snapshot()?.workflows ?? {});
  }

  async run(nameOrDefinition, args = {}, options = {}) {
    const entry = typeof nameOrDefinition === "string"
      ? this.definitions.active.find((item) => item.definition.name === nameOrDefinition)
      : { definition: nameOrDefinition, valid: true, runnable: true };
    if (!entry?.definition) throw new Error(`Workflow definition not found: ${nameOrDefinition}.`);
    if (!entry.valid) throw new Error(`Workflow definition is invalid: ${entry.errors?.join("; ")}.`);
    const definition = entry.definition;
    const approval = evaluateWorkflowApproval(definition, options);
    const workflowRunId = String(options.workflowRunId ?? randomUUID());
    const projection = estimateWorkflowProjection(definition, args);
    const budget = normalizeWorkflowBudget({ ...(definition.budgets ?? {}), ...(options.budget ?? {}) });
    const warnings = [...(definition.validation?.warnings ?? []), ...approval.warnings];
    if (projection.calls >= 25) warnings.push(`Projected ${projection.calls} agent calls.`);
    if (projection.totalTokens >= 1_500_000) warnings.push(`Projected ${(projection.totalTokens / 1_000_000).toFixed(1)}M tokens.`);
    if (projection.calls > budget.maxCalls || projection.requests > budget.maxRequests || projection.totalTokens > budget.maxTokens || projection.cost > budget.maxCostUsd) {
      warnings.push("Projected workflow usage exceeds at least one configured budget; scheduling stops at the enforced limit.");
    }
    const run = normalizeWorkflowRun({
      fleetId: this.controller.fleetId,
      workflowRunId,
      definitionName: definition.name,
      definitionRevision: definition.revision,
      scriptHash: definition.scriptHash,
      source: definition.origin,
      trust: definition.trusted ? "trusted" : "untrusted",
      status: approval.required && !approval.approved ? "awaiting-approval" : "queued",
      args,
      originatingThreadId: options.originatingThreadId ?? this.controller.rootThreadId,
      budget,
      projected: projection,
      warnings,
      approval,
    });
    await this.eventStore.append("workflow.created", { workflow: run }, { workflowRunId, flush: true });
    await this.eventStore.writeWorkflowScript(workflowRunId, definition.source);
    if (approval.required && !approval.approved) {
      await this.eventStore.append("workflow.approval.requested", { approval }, { workflowRunId, flush: true });
      assertWorkflowApproved(definition, options);
    }
    const execution = this.executeRun(run, definition, args, options);
    if (options.background !== false) {
      void execution;
      return this.controller.snapshot().workflows[workflowRunId];
    }
    return execution;
  }

  async executeRun(run, definition, args, options = {}) {
    const workflowRunId = run.workflowRunId;
    const abortController = new AbortController();
    const sandbox = new WorkflowSandboxHost(options.sandbox);
    const cacheDirectory = path.join(this.eventStore.workflowDirectory(workflowRunId), "cache");
    const scheduler = new WorkflowScheduler({
      controller: this.controller,
      eventStore: this.eventStore,
      workflowRunId,
      definition,
      args,
      budget: run.budget,
      cacheDirectory,
    });
    this.active.set(workflowRunId, { abortController, sandbox, scheduler, definition, args, options });
    await this.eventStore.append("workflow.started", { startedAt: new Date().toISOString() }, { workflowRunId, flush: true });
    try {
      const result = await sandbox.execute({
        source: definition.source,
        args,
        cwd: this.project,
        signal: abortController.signal,
        projectedCalls: run.projected?.requests,
        onRequest: (operation, request) => scheduler.handle(operation, request),
      });
      await this.eventStore.append("workflow.completed", { status: "completed", result, warnings: run.warnings }, { workflowRunId, flush: true });
      return this.controller.snapshot().workflows[workflowRunId];
    } catch (error) {
      const cancelled = error?.name === "AbortError" || abortController.signal.aborted;
      const partial = error?.code === "WORKFLOW_BUDGET_EXHAUSTED";
      await this.eventStore.append("workflow.failed", {
        status: cancelled ? "cancelled" : partial ? "partial" : "failed",
        error: { name: error?.name ?? "Error", message: error instanceof Error ? error.message : String(error) },
      }, { workflowRunId, flush: true });
      return this.controller.snapshot().workflows[workflowRunId];
    } finally {
      this.active.delete(workflowRunId);
    }
  }

  status(workflowRunId) {
    const run = this.controller.snapshot()?.workflows?.[workflowRunId];
    if (!run) throw new Error(`Workflow run not found: ${workflowRunId}.`);
    return run;
  }

  async pause(workflowRunId) {
    const active = this.active.get(workflowRunId);
    if (!active) throw new Error("Workflow is not actively running.");
    active.scheduler.pause();
    await this.eventStore.append("workflow.paused", {}, { workflowRunId, flush: true });
    return this.status(workflowRunId);
  }

  async resume(workflowRunId) {
    const active = this.active.get(workflowRunId);
    if (active) {
      active.scheduler.resume();
      await this.eventStore.append("workflow.started", { resumedAt: new Date().toISOString() }, { workflowRunId });
      return this.status(workflowRunId);
    }
    const run = this.status(workflowRunId);
    if (!TERMINAL_WORKFLOW_STATES.has(run.status) && run.status !== "recovering" && run.status !== "paused") throw new Error("Workflow cannot be resumed from its current state.");
    const definition = this.definitions.active.find((entry) => entry.definition.name === run.definitionName)?.definition;
    if (!definition) throw new Error(`Workflow definition is no longer available: ${run.definitionName}.`);
    return this.executeRun({ ...run, status: "queued", attempt: run.attempt + 1 }, definition, run.args, { approved: true });
  }

  async stop(workflowRunId, reason = "stopped by root") {
    const active = this.active.get(workflowRunId);
    if (active) {
      active.scheduler.stop();
      active.abortController.abort(reason);
      await active.sandbox.stop(reason);
    }
    const run = this.status(workflowRunId);
    if (!TERMINAL_WORKFLOW_STATES.has(run.status)) await this.eventStore.append("workflow.failed", { status: "cancelled", error: { message: reason } }, { workflowRunId, flush: true });
    return this.status(workflowRunId);
  }

  async restart(workflowRunId, options = {}) {
    await this.stop(workflowRunId, "workflow restart");
    const run = this.status(workflowRunId);
    const definition = this.definitions.active.find((entry) => entry.definition.name === run.definitionName)?.definition;
    if (!definition) throw new Error(`Workflow definition is no longer available: ${run.definitionName}.`);
    return this.executeRun({ ...run, status: "queued", attempt: run.attempt + 1 }, definition, options.args ?? run.args, { approved: true });
  }

  async save(workflowRunId, options = {}) {
    const run = this.status(workflowRunId);
    const active = this.active.get(workflowRunId);
    const definition = active?.definition ?? this.definitions.active.find((entry) => entry.definition.name === run.definitionName)?.definition;
    if (!definition) throw new Error("Workflow source is unavailable.");
    const scope = options.scope === "project" ? "project" : "personal";
    const directory = scope === "project"
      ? path.join(this.project, ".zyra", "workflows")
      : path.join(process.env.USERPROFILE ?? process.env.HOME, ".zyra", "workflows");
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, `${definition.name}.mjs`);
    await writeFile(file, definition.source, { encoding: "utf8", flag: options.overwrite ? "w" : "wx" });
    await this.reloadDefinitions();
    return { file, scope };
  }

  getScript(workflowRunId) {
    const run = this.status(workflowRunId);
    return this.active.get(workflowRunId)?.definition?.source
      ?? this.definitions.active.find((entry) => entry.definition.name === run.definitionName)?.definition?.source
      ?? null;
  }

  async dispose() {
    await Promise.allSettled([...this.active.keys()].map((id) => this.stop(id, "workflow runtime disposed")));
  }
}
