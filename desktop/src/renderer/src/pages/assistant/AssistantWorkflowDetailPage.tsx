import { Fragment, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Circle, LoaderCircle, SlidersHorizontal, Users, X } from 'lucide-react'
import type { AgentRunState, WorkflowCallState, WorkflowNodeStatus, WorkflowRunState } from '@shared/assistant/contracts'
import { AnchoredMenuPopover } from '@/components/ui/AnchoredMenuPopover'
import { AssistantAgentAvatar } from './AssistantAgentPrimitives'
import { AssistantModelProviderIcon } from './AssistantModelProviderIcon'
import { resolveAssistantInboxModelPresentation } from './assistant-model-labels'
import { formatAssistantAgentTokens } from './assistant-agent-presentation'
import { projectWorkflowExecution, workflowCallError } from './assistant-workflow-execution'
import { formatAssistantWorkflowCost, formatAssistantWorkflowElapsed, formatAssistantWorkflowInput, humanizeWorkflowValue, resolveAssistantWorkflowIdentity } from './assistant-workflow-presentation'
import { AssistantWorkflowActionButtons, AssistantWorkflowStatusBadge, type AssistantWorkflowAction } from './AssistantWorkflowPrimitives'
import './assistant-workflow-directory.css'

export function AssistantWorkflowDetailPage({ run, agents, onBack, onOpenAgent, onWorkflowAction }: {
    run: WorkflowRunState; agents: Record<string, AgentRunState>; onBack: () => void; onOpenAgent: (id: string) => void
    onWorkflowAction?: (action: AssistantWorkflowAction, id: string) => void
}) {
    const [detailsOpen, setDetailsOpen] = useState(false)
    const detailsAnchor = useRef<HTMLButtonElement>(null)
    const identity = resolveAssistantWorkflowIdentity(run)
    const stages = projectWorkflowExecution(run)
    const calls = Object.values(run.calls)
    const result = run.result == null ? '' : typeof run.result === 'string' ? run.result : formatAssistantWorkflowInput(run.result)
    // Keep each failure with the step that produced it, rather than repeating it.
    const nodeErrors = calls.map(call => workflowCallError(call) || (call.agentRunId ? agents[call.agentRunId]?.error?.message : '') || '')
    const globalError = run.error?.message && !nodeErrors.includes(run.error.message) && !Object.values(run.phases).some(phase => phase.error === run.error?.message) ? run.error.message : ''
    return <section className="assistant-workflow-detail" data-testid="assistant-workflow-detail-page" data-workflow-run-id={run.workflowRunId}>
        <header className="assistant-workflow-detail__header">
            <button className="assistant-workflow-detail__back" type="button" onClick={onBack} aria-label="Back to workflow directory"><ChevronLeft size={18} /></button>
            <h2 title={identity.name}>{identity.name}</h2><AssistantWorkflowStatusBadge status={run.status} />
            <AssistantWorkflowActionButtons run={run} onAction={onWorkflowAction} />
            <button ref={detailsAnchor} className="assistant-workflow-detail__details-button" type="button" aria-expanded={detailsOpen} aria-haspopup="dialog" onClick={() => setDetailsOpen(open => !open)}><SlidersHorizontal size={13} />Details</button>
        </header>
        <div data-assistant-capsule-scroll="workflow-detail" className="assistant-workflow-detail__scroll custom-scrollbar">
            <div className="assistant-workflow-detail__body">
                {globalError ? <p className="workflow-execution__error" role="status"><X size={14} />{globalError}</p> : null}
                {stages.length ? <div className="workflow-execution__columns" aria-hidden="true"><span>Stage</span><div><span>Agent task</span><span>Model</span><span>Status</span></div></div> : null}
                <ol className="workflow-execution workflow-execution--timeline" aria-label="Workflow execution">
                    {stages.map((stage, index) => <li key={stage.id} className="workflow-execution__stage" data-status={stage.phase?.status}>
                        <div className="workflow-execution__stage-label"><div className="workflow-execution__stage-heading"><span className="workflow-execution__step">{String(index + 1).padStart(2, '0')}</span><h3>{stage.name}</h3></div>
                            {stage.concurrent ? <span className="workflow-execution__parallel">{stage.calls.length} agents in parallel</span> : null}
                        </div>
                        <div className="workflow-execution__calls">
                            {stage.calls.map(call => <WorkflowExecutionRow key={call.callId} call={call} agent={call.agentRunId ? agents[call.agentRunId] || null : null} onOpenAgent={onOpenAgent} />)}
                            {!stage.calls.length ? <div className="workflow-execution__empty">{stage.phase ? nodeStatusLabel(stage.phase.status) : 'No agents recorded'}</div> : null}
                        </div>
                        {stage.phase?.error && !nodeErrors.includes(stage.phase.error) ? <p className="workflow-execution__error">{stage.phase.error}</p> : null}
                    </li>)}
                </ol>
                {!stages.length ? <p className="assistant-workflow-detail__note">{run.status === 'awaiting-approval' ? 'Waiting for approval to start.' : 'No execution recorded yet.'}</p> : null}
                {result ? <details className="workflow-execution__result"><summary>Result</summary><p>{result}</p></details> : null}
            </div>
        </div>
        {detailsOpen ? <AnchoredMenuPopover anchorRef={detailsAnchor} onClose={() => setDetailsOpen(false)} width={280} role="dialog" label="Workflow run details"><div className="workflow-run-details">
            <h3>Run details</h3><dl>
                <dt>Runtime</dt><dd>{formatAssistantWorkflowElapsed(run)}</dd>
                <dt>Agents</dt><dd>{run.agentRunIds.length}</dd>
                <dt>Tokens</dt><dd>{formatAssistantAgentTokens(run.usage.totalTokens)}</dd>
                <dt>Cost</dt><dd>{formatAssistantWorkflowCost(run.usage.cost)}</dd>
            </dl>
            <details><summary>Budget</summary><dl>
                <dt>Calls</dt><dd>{calls.length} / {run.budget.maxCalls}</dd>
                <dt>Requests</dt><dd>{run.usage.requests || 0} / {run.budget.maxRequests}</dd>
                <dt>Tokens</dt><dd>{formatAssistantAgentTokens(run.budget.maxTokens)}</dd>
                <dt>Cost limit</dt><dd>{formatAssistantWorkflowCost(run.budget.maxCostUsd)}</dd>
                <dt>Concurrency</dt><dd>{run.budget.maxConcurrency}</dd>
                <dt>Cached calls</dt><dd>{run.cacheHits}</dd>
            </dl></details>
            {Object.keys(run.args).length ? <details><summary>Inputs</summary><dl>{Object.entries(run.args).map(([key, value]) => <Fragment key={key}><dt>{humanizeWorkflowValue(key)}</dt><dd>{formatAssistantWorkflowInput(value)}</dd></Fragment>)}</dl></details> : null}
            {run.warnings.length ? <details><summary>Warnings</summary>{run.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</details> : null}
        </div></AnchoredMenuPopover> : null}
    </section>
}
function nodeStatusLabel(status: WorkflowNodeStatus) {
    return status === 'pending' ? 'Not started' : status === 'completed' ? 'Complete' : status[0]!.toUpperCase() + status.slice(1)
}
function NodeStatus({ status }: { status: WorkflowNodeStatus }) {
    const Icon = status === 'completed' || status === 'cached' ? Check : status === 'failed' || status === 'cancelled' ? X : status === 'running' ? LoaderCircle : Circle
    return <span className="workflow-execution__node-status" data-status={status}><Icon size={11} aria-hidden="true" />{nodeStatusLabel(status)}</span>
}
function WorkflowExecutionRow({ call, agent, onOpenAgent }: { call: WorkflowCallState; agent: AgentRunState | null; onOpenAgent: (id: string) => void }) {
    const error = workflowCallError(call) || agent?.error?.message
    const activity = ['running', 'blocked'].includes(call.status) ? agent?.activity?.summary : ''
    const selectedModel = call.selectedModel || agent?.selectedModel
    const model = selectedModel || call.requestedModel || agent?.requestedModel
    const modelQualifier = !selectedModel && model ? 'Requested' : ['queued', 'pending'].includes(call.status) ? 'Planned' : ''
    const content = <>
        <span className="workflow-execution__task">{agent ? <AssistantAgentAvatar run={agent} size={22} /> : <Users size={18} aria-hidden="true" />}<strong>{agent?.label || humanizeWorkflowValue(call.agentName || 'Agent')}</strong></span>
        <span className="workflow-execution__model" title={model ? `${modelQualifier || 'Model'}: ${model}` : 'Model not recorded'}>
            {model ? <><AssistantModelProviderIcon model={model} size={13} /><span className="workflow-execution__model-name">{resolveAssistantInboxModelPresentation(model).modelName}</span>{modelQualifier ? <small>{modelQualifier}</small> : null}</> : <span>Not recorded</span>}
        </span>
        <NodeStatus status={call.status} />
        {agent ? <ChevronRight size={12} className="workflow-execution__open" aria-hidden="true" /> : null}
        {error ? <span className="workflow-execution__step-error" title={error}>{error}</span> : activity ? <span className="workflow-execution__activity" title={activity}>{activity}</span> : null}
    </>
    return agent ? <button type="button" className="workflow-execution__call" data-status={call.status} data-call-id={call.callId} onClick={() => onOpenAgent(agent.agentRunId)} aria-label={`Open ${agent.label}'s agent transcript`}>{content}</button>
        : <div className="workflow-execution__call" data-status={call.status} data-call-id={call.callId}>{content}</div>
}
