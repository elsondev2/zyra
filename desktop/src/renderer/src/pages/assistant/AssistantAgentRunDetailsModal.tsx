import type { ReactNode, RefObject } from 'react'
import { ChevronRight, X } from 'lucide-react'
import type { AgentRunState } from '@shared/assistant/contracts'
import { AnchoredMenuPopover } from '@/components/ui/AnchoredMenuPopover'
import { AssistantModelProviderIcon } from './AssistantModelProviderIcon'
import { formatAssistantAgentTokens, shortAssistantAgentModel } from './assistant-agent-presentation'
import { AssistantAgentStatusBadge } from './AssistantAgentPrimitives'

/** The legacy export name is retained while callers migrate to the anchored inspector. */
export function AssistantAgentRunDetailsModal({ open, run, anchorRef, onClose }: {
    open: boolean
    run: AgentRunState
    anchorRef: RefObject<HTMLElement | null>
    onClose: () => void
}) {
    if (!open) return null
    return <AnchoredMenuPopover anchorRef={anchorRef} label="Run details" role="dialog" width={280} browserZIndex={180} onClose={onClose} autoFocus>
        <section className="assistant-agent-run-info" data-testid="assistant-agent-run-details-popover">
            <header><h3>Run details</h3><button type="button" onClick={onClose} aria-label="Close run details"><X size={14} /></button></header>
            <dl>
                <Fact label="Status"><AssistantAgentStatusBadge status={run.status} /></Fact>
                <Fact label="Model"><span className="assistant-agent-run-info__model" title={run.selectedModel}>
                    <AssistantModelProviderIcon model={run.selectedModel} />
                    <span>{shortAssistantAgentModel(run.selectedModel)}</span><span className="assistant-agent-run-info__effort">· {run.effort}</span>
                </span></Fact>
                <Fact label="Usage">{formatAssistantAgentTokens(run.usage.totalTokens)} tokens</Fact>
            </dl>
            <details className="assistant-agent-run-info__permissions">
                <summary><span>Access</span><span>{humanize(run.permissionMode)}</span><ChevronRight size={12} /></summary>
                <div className="assistant-agent-run-info__access">
                    <p>{run.isolation === 'worktree' ? 'Separate worktree' : 'Shared workspace'}</p>
                    <Scope label="Read" values={run.readScope} />
                    {run.permissionMode !== 'read-only' ? <Scope label="Write" values={run.writeScope} /> : null}
                    {!run.readScope.length && !run.writeScope.length ? <p>No file scope recorded.</p> : null}
                    {run.worktree ? <Scope label="Worktree" values={[run.worktree.directory]} /> : null}
                    <details className="assistant-agent-run-info__tools">
                        <summary><span>Tools</span><span>{run.grantedTools.length} allowed</span><ChevronRight size={12} /></summary>
                        <div className="assistant-agent-run-info__tool-list">{run.grantedTools.length ? run.grantedTools.map(tool => <code key={tool}>{tool}</code>) : <span>No tools recorded</span>}</div>
                        {run.deniedTools.length ? <p className="assistant-agent-run-info__restriction">Denied: {run.deniedTools.join(', ')}</p> : null}
                        {run.deniedCapabilities.length ? <p className="assistant-agent-run-info__restriction">Restricted: {run.deniedCapabilities.join(', ')}</p> : null}
                    </details>
                </div>
            </details>
        </section>
    </AnchoredMenuPopover>
}
function Fact({ label, children }: { label: string; children: ReactNode }) {
    return <div><dt>{label}</dt><dd>{children}</dd></div>
}
function Scope({ label, values }: { label: string; values: string[] }) {
    if (!values.length) return null
    return <div className="assistant-agent-run-info__scope"><h4>{label}</h4><ul>{values.slice(0, 2).map(value => <li key={value}><code title={value}>{value}</code></li>)}
        {values.length > 2 ? <li><details><summary>{values.length - 2} more paths<ChevronRight size={11} /></summary><ul>{values.slice(2).map(value => <li key={value}><code title={value}>{value}</code></li>)}</ul></details></li> : null}
    </ul></div>
}
function humanize(value: string) {
    return value.replace(/[-_]/g, ' ').replace(/^./, letter => letter.toUpperCase())
}
