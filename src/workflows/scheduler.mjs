import { createHash, randomUUID } from "node:crypto";
import { normalizeWorkflowBudget } from "./contracts.mjs";
import { createWorkflowCallFingerprint, WorkflowCache } from "./cache.mjs";

export class WorkflowScheduler {
  constructor(options = {}) {
    this.controller = options.controller;
    this.eventStore = options.eventStore;
    this.workflowRunId = options.workflowRunId;
    this.definition = options.definition;
    this.args = options.args ?? {};
    this.budget = normalizeWorkflowBudget(options.budget);
    this.callCount = 0;
    this.requestCount = 0;
    this.tokenCount = 0;
    this.costUsd = 0;
    this.runningCalls = 0;
    this.concurrencyWaiters = [];
    this.paused = false;
    this.pauseWaiters = [];
    this.stopped = false;
    this.stopReason = "workflow stopped";
    this.activeAgentRunIds = new Set();
    this.cache = new WorkflowCache(options.cacheDirectory);
  }

  async handle(operation, request) {
    if (operation === "phase") return this.phase(request);
    if (operation === "agent") return this.agent(request);
    throw new Error(`Unsupported sandbox operation: ${operation}.`);
  }

  async phase(request = {}) {
    const phaseId = String(request.name ?? "phase");
    await this.eventStore.append("workflow.phase.changed", {
      phaseId,
      status: request.status ?? "running",
      error: request.error ?? null,
      updatedAt: new Date().toISOString(),
    }, { workflowRunId: this.workflowRunId, phaseId });
    return { phaseId, status: request.status };
  }

  async agent(request = {}) {
    const release = await this.acquireConcurrency();
    try { return await this.scheduleAgent(request); }
    finally { release(); }
  }

  async scheduleAgent(request = {}) {
    await this.waitUntilRunnable();
    this.assertCanSchedule();
    const prompt = String(request.prompt ?? "");
    const options = request.options ?? {};
    const phase = request.phase ? String(request.phase) : null;
    const stableKey = String(options.key ?? options.label ?? `${phase ?? "root"}:${request.ordinal ?? this.callCount}`);
    const route = this.controller.previewRoute({
      model: options.model ?? "inherit",
      fallbackModels: options.fallbackModels,
      envelope: { task: options.task ?? inferTask(prompt), tools: options.tools ?? [] },
    });
    const fingerprint = createWorkflowCallFingerprint({
      scriptHash: this.definition.scriptHash,
      args: this.args,
      phase,
      stableKey,
      prompt,
      definitionRevision: options.agent ? this.controller.listDefinitions().active.find((entry) => entry.name === options.agent)?.definition?.version : "dynamic",
      selectedModelPolicy: { requested: route.requested, selected: route.selectedKey, fallbacks: options.fallbackModels },
      tools: options.tools,
      capabilities: options.capabilities,
      isolation: options.isolation,
      writeScope: options.writeScope,
      schema: options.schema,
    });
    const callId = `call-${fingerprint.slice(0, 16)}`;
    const cached = await this.cache.get(fingerprint);
    if (cached) {
      await this.emitCall({ callId, fingerprint, stableKey, phaseId: phase, status: "cached", cached: true, selectedModel: route.selectedKey });
      return cached.value;
    }

    this.callCount += 1;
    await this.emitCall({ callId, fingerprint, stableKey, phaseId: phase, status: "running", selectedModel: route.selectedKey, requestedModel: route.requested });
    let run;
    try {
      run = await this.runAgentAttempt(prompt, options, route, phase);
      let value = resultValue(run, options.schema);
      if (options.schema && !validateSchema(value, options.schema)) {
        const retry = await this.runAgentAttempt(prompt, options, route, phase);
        value = resultValue(retry, options.schema);
        run = retry;
        if (!validateSchema(value, options.schema)) {
          const escalation = this.controller.modelRouter.escalate(route, "schema_validation_failed_twice", {
            envelope: { task: options.task ?? inferTask(prompt), tools: options.tools ?? [] },
          });
          run = await this.runAgentAttempt(prompt, { ...options, model: escalation.selectedKey }, escalation, phase);
          value = resultValue(run, options.schema);
          if (!validateSchema(value, options.schema)) throw new Error("Structured child result failed schema validation after bounded escalation.");
        }
      }
      await this.cache.put(fingerprint, value, { callId, agentRunId: run.agentRunId, selectedModel: run.selectedModel });
      await this.emitCall({
        callId, fingerprint, stableKey, phaseId: phase, status: "completed", selectedModel: run.selectedModel,
        agentRunId: run.agentRunId, completedAt: new Date().toISOString(), escalated: run.modelRoute?.escalationReason != null,
      });
      return value;
    } catch (error) {
      await this.emitCall({ callId, fingerprint, stableKey, phaseId: phase, status: "failed", error: { message: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  }

  async runAgentAttempt(prompt, options, route, phase) {
    if (this.requestCount >= this.budget.maxRequests) throw budgetError("request", this.budget.maxRequests);
    if (this.tokenCount >= this.budget.maxTokens) throw budgetError("token", this.budget.maxTokens);
    if (this.costUsd >= this.budget.maxCostUsd) throw budgetError("cost", this.budget.maxCostUsd);
    this.requestCount += 1;
    const requestedAgentRunId = randomUUID();
    let agentRunId = requestedAgentRunId;
    this.activeAgentRunIds.add(agentRunId);
    try {
      const spawned = await this.controller.spawn({
        prompt,
        goal: prompt,
        agent: options.agent,
        label: options.label,
        model: route.selectedKey,
        fallbackModels: options.fallbackModels,
        effort: options.effort,
        tools: options.tools,
        permissionMode: options.permissionMode,
        isolation: options.isolation,
        writeScope: options.writeScope,
        readScope: options.readScope,
        successCriteria: options.schema ? ["Return JSON matching the supplied schema."] : options.successCriteria,
        workflowRunId: this.workflowRunId,
        phaseId: phase,
        agentRunId,
        background: true,
        returnHandle: true,
      });
      if (spawned?.agentRunId && spawned.agentRunId !== agentRunId) {
        this.activeAgentRunIds.delete(agentRunId);
        agentRunId = spawned.agentRunId;
        this.activeAgentRunIds.add(agentRunId);
      }
      await this.eventStore.append("workflow.agent.linked", { agentRunId }, { workflowRunId: this.workflowRunId, agentRunId, phaseId: phase });
      if (this.stopped) {
        await this.controller.stop?.(agentRunId, this.stopReason);
        throw abortError();
      }
      const run = typeof this.controller.wait === "function" && ["queued", "starting", "running", "recovering"].includes(spawned?.status)
        ? await this.controller.wait(agentRunId)
        : spawned;
      if (run?.status && run.status !== "completed") {
        if (run.status === "cancelled") throw abortError();
        throw new Error(run.error?.message || `Workflow child agent ended with status ${run.status}.`);
      }
      this.tokenCount += Number(run?.usage?.totalTokens) || 0;
      this.costUsd += Number(run?.usage?.cost) || 0;
      await this.eventStore.append("workflow.usage.updated", {
        usage: { totalTokens: this.tokenCount, requests: this.requestCount, cost: this.costUsd },
      }, { workflowRunId: this.workflowRunId });
      return run;
    } finally {
      this.activeAgentRunIds.delete(agentRunId);
    }
  }

  async acquireConcurrency() {
    while (this.runningCalls >= this.budget.maxConcurrency) {
      await new Promise((resolve) => this.concurrencyWaiters.push(resolve));
      if (this.stopped) throw abortError();
    }
    this.runningCalls += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.runningCalls = Math.max(0, this.runningCalls - 1);
      this.concurrencyWaiters.shift()?.();
    };
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    for (const resolve of this.pauseWaiters.splice(0)) resolve();
  }

  async stop(reason = "workflow stopped") {
    this.stopped = true;
    this.stopReason = reason;
    this.resume();
    for (const resolve of this.concurrencyWaiters.splice(0)) resolve();
    if (typeof this.controller.stop === "function") {
      await Promise.allSettled([...this.activeAgentRunIds].map((agentRunId) => this.controller.stop(agentRunId, reason)));
    }
  }

  async waitUntilRunnable() {
    if (this.stopped) throw abortError();
    if (!this.paused) return;
    await new Promise((resolve) => this.pauseWaiters.push(resolve));
    if (this.stopped) throw abortError();
  }

  assertCanSchedule() {
    if (this.callCount >= this.budget.maxCalls) throw budgetError("call", this.budget.maxCalls);
    if (this.requestCount >= this.budget.maxRequests) throw budgetError("request", this.budget.maxRequests);
    if (this.tokenCount >= this.budget.maxTokens) throw budgetError("token", this.budget.maxTokens);
    if (this.costUsd >= this.budget.maxCostUsd) throw budgetError("cost", this.budget.maxCostUsd);
  }

  emitCall(payload) {
    return this.eventStore.append("workflow.call.changed", payload, { workflowRunId: this.workflowRunId, phaseId: payload.phaseId });
  }
}

function resultValue(run, schema) {
  const structured = run.result?.structured;
  if (schema) {
    if (structured !== undefined) return structured;
    const text = String(run.result?.text ?? "").replace(/^\[Child result:[^\n]*\]\n/, "").trim();
    try { return JSON.parse(text); } catch { return null; }
  }
  return structured ?? run.result?.text ?? null;
}

function validateSchema(value, schema) {
  if (!schema || typeof schema !== "object") return true;
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if ((schema.required ?? []).some((key) => !(key in value))) return false;
    return Object.entries(schema.properties ?? {}).every(([key, property]) => !(key in value) || validateSchema(value[key], property));
  }
  if (schema.type === "array") return Array.isArray(value) && value.every((item) => validateSchema(item, schema.items));
  if (schema.type === "string") return typeof value === "string";
  if (schema.type === "number") return typeof value === "number" && Number.isFinite(value);
  if (schema.type === "integer") return Number.isSafeInteger(value);
  if (schema.type === "boolean") return typeof value === "boolean";
  return true;
}

function inferTask(prompt) {
  const text = String(prompt).toLowerCase();
  if (/review|verify|finding/.test(text)) return "review";
  if (/find|list|inventory|extract/.test(text)) return "search";
  if (/security|auth|permission/.test(text)) return "security";
  if (/synthesize|deduplicate|rank/.test(text)) return "synthesis";
  return "implementation";
}

function budgetError(kind, limit) {
  const error = new Error(`Workflow ${kind} budget exhausted at ${limit}.`);
  error.code = "WORKFLOW_BUDGET_EXHAUSTED";
  return error;
}

function abortError() {
  const error = new Error("Workflow stopped.");
  error.name = "AbortError";
  return error;
}
