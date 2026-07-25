import { TERMINAL_AGENT_STATES, TERMINAL_WORKFLOW_STATES } from "../contracts.mjs";

export function planFleetRecovery(snapshot, options = {}) {
  const recoveredAt = options.recoveredAt ?? new Date().toISOString();
  const events = [];
  const interruptedAgentRunIds = [];
  const interruptedWorkflowRunIds = [];
  for (const run of Object.values(snapshot?.agents ?? {})) {
    if (TERMINAL_AGENT_STATES.has(run.status)) continue;
    interruptedAgentRunIds.push(run.agentRunId);
    events.push({
      type: "agent.state.changed",
      agentRunId: run.agentRunId,
      payload: { status: "recovering", heartbeatAt: recoveredAt, activity: { kind: "recovery", summary: "Recovered after restart" } },
    });
  }
  for (const run of Object.values(snapshot?.workflows ?? {})) {
    if (TERMINAL_WORKFLOW_STATES.has(run.status)) continue;
    interruptedWorkflowRunIds.push(run.workflowRunId);
    events.push({
      type: "workflow.failed",
      workflowRunId: run.workflowRunId,
      payload: { status: "recovering", error: null, completedAt: null },
    });
  }
  return {
    recoveredAt,
    interruptedAgentRunIds,
    interruptedWorkflowRunIds,
    events,
    staleWriteLockRunIds: Object.keys(snapshot?.writeLocks ?? {}).filter((runId) => !TERMINAL_AGENT_STATES.has(snapshot?.agents?.[runId]?.status)),
  };
}

export function reconcileTerminalWorkflow(snapshot, workflowRunId) {
  const workflow = snapshot?.workflows?.[workflowRunId];
  if (!workflow || !TERMINAL_WORKFLOW_STATES.has(workflow.status)) return snapshot;
  const agents = { ...snapshot.agents };
  for (const agentRunId of workflow.agentRunIds ?? []) {
    const run = agents[agentRunId];
    if (!run || TERMINAL_AGENT_STATES.has(run.status)) continue;
    agents[agentRunId] = {
      ...run,
      status: "interrupted",
      activity: { kind: "reconciled", summary: `Workflow is ${workflow.status}` },
      completedAt: workflow.completedAt ?? snapshot.updatedAt,
    };
  }
  return { ...snapshot, agents };
}
