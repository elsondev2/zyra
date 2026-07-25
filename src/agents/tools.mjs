import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";

export function createFleetTools(holder) {
  const agentTool = defineTool({
    name: "agent",
    label: "Agent fleet",
    description: "Spawn, steer, inspect, wait for, stop, retry, or resume a bounded child agent. Children never receive this tool.",
    parameters: Type.Object({
      action: Type.Union(["spawn", "send", "wait", "status", "stop", "retry", "resume"].map((value) => Type.Literal(value))),
      agentRunId: Type.Optional(Type.String()),
      agent: Type.Optional(Type.String()),
      prompt: Type.Optional(Type.String()),
      label: Type.Optional(Type.String()),
      model: Type.Optional(Type.String()),
      fallbackModels: Type.Optional(Type.Array(Type.String())),
      effort: Type.Optional(Type.String()),
      tools: Type.Optional(Type.Array(Type.String())),
      successCriteria: Type.Optional(Type.Array(Type.String())),
      permissionMode: Type.Optional(Type.String()),
      isolation: Type.Optional(Type.Union([Type.Literal("shared"), Type.Literal("worktree")])),
      readScope: Type.Optional(Type.Array(Type.String())),
      writeScope: Type.Optional(Type.Array(Type.String())),
      background: Type.Optional(Type.Boolean()),
      timeoutMs: Type.Optional(Type.Number()),
    }),
    execute: async (_id, params) => toolResult(await executeAgentAction(requireController(holder), params)),
  });

  const workflowTool = defineTool({
    name: "workflow",
    label: "Workflow runtime",
    description: "Run and control a durable sandboxed workflow. Workflow JavaScript has no Node, filesystem, shell, credential, or network access.",
    parameters: Type.Object({
      action: Type.Union(["run", "pause", "resume", "status", "stop", "restart", "save"].map((value) => Type.Literal(value))),
      workflowRunId: Type.Optional(Type.String()),
      name: Type.Optional(Type.String()),
      args: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
      approved: Type.Optional(Type.Boolean()),
      scope: Type.Optional(Type.Union([Type.Literal("personal"), Type.Literal("project")])),
    }),
    execute: async (_id, params) => toolResult(await executeWorkflowAction(requireWorkflow(holder), params)),
  });
  return [agentTool, workflowTool];
}

async function executeAgentAction(controller, params) {
  switch (params.action) {
    case "spawn":
      if (!params.prompt) throw new Error("agent spawn requires prompt.");
      return controller.spawn({ ...params, goal: params.prompt });
    case "send":
      return controller.send(requiredId(params), requiredPrompt(params));
    case "wait":
      return controller.wait(requiredId(params), { timeoutMs: params.timeoutMs });
    case "status":
      return controller.status(params.agentRunId);
    case "stop":
      return controller.stop(requiredId(params));
    case "retry":
      return controller.retry(requiredId(params), params.prompt ? { goal: params.prompt } : {});
    case "resume":
      return controller.resume(requiredId(params), params.prompt);
    default:
      throw new Error(`Unknown agent action: ${params.action}.`);
  }
}

async function executeWorkflowAction(runtime, params) {
  switch (params.action) {
    case "run":
      if (!params.name) throw new Error("workflow run requires name.");
      return runtime.run(params.name, params.args ?? {}, { approved: params.approved === true });
    case "pause": return runtime.pause(requiredWorkflowId(params));
    case "resume": return runtime.resume(requiredWorkflowId(params));
    case "status": return params.workflowRunId ? runtime.status(params.workflowRunId) : runtime.listRuns();
    case "stop": return runtime.stop(requiredWorkflowId(params));
    case "restart": return runtime.restart(requiredWorkflowId(params), { args: params.args });
    case "save": return runtime.save(requiredWorkflowId(params), { scope: params.scope });
    default: throw new Error(`Unknown workflow action: ${params.action}.`);
  }
}

function requireController(holder) {
  if (!holder?.controller) throw new Error("Agent fleet is still initializing.");
  return holder.controller;
}

function requireWorkflow(holder) {
  if (!holder?.workflowRuntime) throw new Error("Workflow runtime is still initializing.");
  return holder.workflowRuntime;
}

function requiredId(params) {
  if (!params.agentRunId) throw new Error(`${params.action} requires agentRunId.`);
  return params.agentRunId;
}

function requiredWorkflowId(params) {
  if (!params.workflowRunId) throw new Error(`${params.action} requires workflowRunId.`);
  return params.workflowRunId;
}

function requiredPrompt(params) {
  if (!params.prompt) throw new Error(`${params.action} requires prompt.`);
  return params.prompt;
}

function toolResult(value) {
  const text = JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text: text.length > 50 * 1024 ? `${text.slice(0, 50 * 1024)}\n[truncated]` : text }], details: { fleet: true } };
}
