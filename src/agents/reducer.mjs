import {
  MAX_APPLIED_EVENT_IDS,
  MAX_PENDING_EVENTS,
  addUsage,
  createFleetSnapshot,
  normalizeAgentRun,
  normalizeUsage,
  normalizeWorkflowRun,
  validateFleetEvent,
} from "./contracts.mjs";

export function reduceFleetEvents(snapshot, incomingEvents = []) {
  let state = snapshot ? createFleetSnapshot(snapshot) : undefined;
  const pending = [...(state?.pendingEvents ?? []), ...(Array.isArray(incomingEvents) ? incomingEvents : [incomingEvents])]
    .filter(Boolean)
    .map(validateFleetEvent);
  if (!state) {
    const seed = pending.find((event) => event.type === "fleet.created") ?? pending[0];
    if (!seed) throw new Error("Cannot reduce an empty fleet without a snapshot.");
    state = createFleetSnapshot({
      fleetId: seed.fleetId,
      rootSessionId: seed.rootSessionId,
      rootThreadId: seed.rootThreadId,
      project: seed.payload?.project,
      createdAt: seed.occurredAt,
    });
  }

  const applied = new Set(state.appliedEventIds);
  const bySequence = new Map();
  for (const event of pending) {
    if (event.fleetId !== state.fleetId || event.rootSessionId !== state.rootSessionId) continue;
    if (applied.has(event.eventId) || event.sequence <= state.lastAppliedSequence) continue;
    const existing = bySequence.get(event.sequence);
    if (!existing || event.eventId.localeCompare(existing.eventId) < 0) bySequence.set(event.sequence, event);
  }

  let nextSequence = state.lastAppliedSequence + 1;
  while (bySequence.has(nextSequence)) {
    const event = bySequence.get(nextSequence);
    bySequence.delete(nextSequence);
    state = applyFleetEvent(state, event);
    applied.add(event.eventId);
    nextSequence += 1;
  }

  return {
    ...state,
    appliedEventIds: [...applied].slice(-MAX_APPLIED_EVENT_IDS),
    pendingEvents: [...bySequence.values()].sort(compareEvents).slice(0, MAX_PENDING_EVENTS),
  };
}

export function applyFleetEvent(snapshot, event) {
  validateFleetEvent(event);
  if (snapshot.fleetId !== event.fleetId) throw new Error("Fleet event belongs to another fleet.");
  if (snapshot.appliedEventIds.includes(event.eventId) || event.sequence <= snapshot.lastAppliedSequence) return snapshot;
  if (event.sequence !== snapshot.lastAppliedSequence + 1) {
    return reduceFleetEvents(snapshot, [event]);
  }

  const state = createFleetSnapshot(snapshot);
  state.lastAppliedSequence = event.sequence;
  state.updatedAt = event.occurredAt;
  state.appliedEventIds = [...state.appliedEventIds, event.eventId].slice(-MAX_APPLIED_EVENT_IDS);
  applyEventMutation(state, event);
  return state;
}

function applyEventMutation(state, event) {
  const payload = event.payload ?? {};
  switch (event.type) {
    case "fleet.created":
      state.project = typeof payload.project === "string" ? payload.project : state.project;
      return;
    case "definitions.changed":
      state.definitionsRevision = Number(payload.revision) || state.definitionsRevision + 1;
      return;
    case "agent.created": {
      const run = normalizeAgentRun({ ...payload.agent, fleetId: state.fleetId, agentRunId: event.agentRunId ?? payload.agent?.agentRunId });
      state.agents[run.agentRunId] = run;
      return;
    }
    case "agent.attempt.started":
      patchAgent(state, event, {
        status: payload.status ?? "starting",
        attempt: payload.attempt,
        attemptId: payload.attemptId,
        retryOfAttemptId: payload.retryOfAttemptId ?? null,
        startedAt: payload.startedAt ?? event.occurredAt,
        completedAt: null,
        error: null,
        result: null,
      });
      return;
    case "agent.session.linked":
      patchAgent(state, event, {
        providerSessionId: payload.providerSessionId ?? null,
        sessionFile: payload.sessionFile ?? null,
        transcriptRef: payload.transcriptRef ?? null,
        cwd: payload.cwd,
        worktree: payload.worktree,
      });
      return;
    case "agent.state.changed":
      patchAgent(state, event, {
        status: payload.status,
        heartbeatAt: payload.heartbeatAt,
        startedAt: payload.startedAt,
        completedAt: payload.completedAt,
        elapsedMs: payload.elapsedMs,
        activity: payload.activity,
        controlLease: payload.controlLease,
      });
      return;
    case "agent.activity":
      patchAgent(state, event, { activity: payload.activity ?? payload, heartbeatAt: event.occurredAt });
      return;
    case "agent.usage.updated": {
      const run = requireAgent(state, event);
      const next = payload.incremental ? addUsage(run.usage, payload.usage) : normalizeUsage(payload.usage);
      state.agents[run.agentRunId] = { ...run, usage: next, heartbeatAt: event.occurredAt };
      recalculateFleetUsage(state);
      return;
    }
    case "agent.result.completed":
      patchAgent(state, event, {
        status: "completed",
        result: payload.result,
        artifacts: payload.artifacts,
        transcriptRef: payload.transcriptRef,
        completedAt: payload.completedAt ?? event.occurredAt,
        elapsedMs: payload.elapsedMs,
        activity: payload.activity ?? null,
      });
      return;
    case "agent.failed":
      patchAgent(state, event, {
        status: payload.status ?? "failed",
        error: payload.error ?? { message: "Agent failed." },
        completedAt: payload.completedAt ?? event.occurredAt,
        elapsedMs: payload.elapsedMs,
      });
      return;
    case "workflow.created": {
      const run = normalizeWorkflowRun({ ...payload.workflow, fleetId: state.fleetId, workflowRunId: event.workflowRunId ?? payload.workflow?.workflowRunId });
      state.workflows[run.workflowRunId] = run;
      return;
    }
    case "workflow.approval.requested":
      patchWorkflow(state, event, { status: "awaiting-approval", approval: payload.approval ?? payload, updatedAt: event.occurredAt });
      return;
    case "workflow.started":
      patchWorkflow(state, event, { status: "running", startedAt: payload.startedAt ?? event.occurredAt, completedAt: null, error: null, result: null, updatedAt: event.occurredAt });
      return;
    case "workflow.phase.changed": {
      const run = requireWorkflow(state, event);
      const phaseId = event.phaseId ?? payload.phaseId;
      if (!phaseId) throw new Error("workflow.phase.changed requires phaseId.");
      state.workflows[run.workflowRunId] = {
        ...run,
        phases: { ...run.phases, [phaseId]: { ...(run.phases[phaseId] ?? {}), ...payload, phaseId, updatedAt: event.occurredAt } },
        updatedAt: event.occurredAt,
      };
      return;
    }
    case "workflow.call.changed": {
      const run = requireWorkflow(state, event);
      const callId = payload.callId;
      if (!callId) throw new Error("workflow.call.changed requires callId.");
      state.workflows[run.workflowRunId] = {
        ...run,
        calls: { ...run.calls, [callId]: { ...(run.calls[callId] ?? {}), ...payload, updatedAt: event.occurredAt } },
        cacheHits: run.cacheHits + (payload.status === "cached" && run.calls[callId]?.status !== "cached" ? 1 : 0),
        updatedAt: event.occurredAt,
      };
      return;
    }
    case "workflow.agent.linked": {
      const run = requireWorkflow(state, event);
      const agentRunId = event.agentRunId ?? payload.agentRunId;
      state.workflows[run.workflowRunId] = {
        ...run,
        agentRunIds: agentRunId ? [...new Set([...run.agentRunIds, agentRunId])] : run.agentRunIds,
        updatedAt: event.occurredAt,
      };
      return;
    }
    case "workflow.usage.updated": {
      const run = requireWorkflow(state, event);
      state.workflows[run.workflowRunId] = {
        ...run,
        usage: payload.incremental ? addUsage(run.usage, payload.usage) : normalizeUsage(payload.usage),
        projected: payload.projected ? normalizeUsage(payload.projected) : run.projected,
        updatedAt: event.occurredAt,
      };
      recalculateFleetUsage(state);
      return;
    }
    case "workflow.paused":
      patchWorkflow(state, event, { status: "paused", updatedAt: event.occurredAt });
      return;
    case "workflow.completed":
      patchWorkflow(state, event, {
        status: payload.status ?? "completed",
        result: payload.result,
        warnings: payload.warnings,
        completedAt: payload.completedAt ?? event.occurredAt,
        updatedAt: event.occurredAt,
      });
      return;
    case "workflow.failed":
      patchWorkflow(state, event, {
        status: payload.status ?? "failed",
        error: payload.error ?? { message: "Workflow failed." },
        completedAt: payload.completedAt ?? event.occurredAt,
        updatedAt: event.occurredAt,
      });
      return;
    case "write-locks.changed":
      state.writeLocks = payload.writeLocks && typeof payload.writeLocks === "object" ? payload.writeLocks : {};
      return;
    case "recovery.changed":
      state.recovery = { ...state.recovery, ...payload };
      return;
    default:
      return;
  }
}

function patchAgent(state, event, patch) {
  const run = requireAgent(state, event);
  state.agents[run.agentRunId] = normalizeAgentRun({ ...run, ...definedEntries(patch), fleetId: state.fleetId });
}

function patchWorkflow(state, event, patch) {
  const run = requireWorkflow(state, event);
  state.workflows[run.workflowRunId] = normalizeWorkflowRun({ ...run, ...definedEntries(patch), fleetId: state.fleetId });
}

function requireAgent(state, event) {
  const id = event.agentRunId ?? event.payload?.agentRunId;
  const run = id ? state.agents[id] : undefined;
  if (!run) throw new Error(`Unknown agent run: ${id ?? "missing"}.`);
  return run;
}

function requireWorkflow(state, event) {
  const id = event.workflowRunId ?? event.payload?.workflowRunId;
  const run = id ? state.workflows[id] : undefined;
  if (!run) throw new Error(`Unknown workflow run: ${id ?? "missing"}.`);
  return run;
}

function recalculateFleetUsage(state) {
  state.usage = Object.values(state.agents).reduce((usage, run) => addUsage(usage, run.usage), normalizeUsage());
}

function definedEntries(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function compareEvents(left, right) {
  return left.sequence - right.sequence || left.eventId.localeCompare(right.eventId);
}
