import type { ControlPrincipal, ControlTarget } from '../../shared/agent-control/contracts'
import type { AgentControlBridgeOperation } from '../../shared/agent-control/protocol'
import { AgentControlError } from './control-errors'

export function backgroundBrowserOperation(
    principal: ControlPrincipal,
    operation: AgentControlBridgeOperation,
    target?: ControlTarget
): AgentControlBridgeOperation {
    if (operation.operation === 'list_targets' && (!operation.targetKind || operation.targetKind === 'zyra-browser')) {
        return { ...operation, targetKind: 'zyra-browser' }
    }
    if (operation.operation === 'open_tab' && operation.reveal !== true) return { ...operation, reveal: false }
    if (operation.operation === 'plan_status' || operation.operation === 'revoke_current_principal') return operation
    const allowed = new Set(['observe', 'act', 'act_sequence', 'perform', 'request_grant', 'release', 'delegate_lease', 'close_tab', 'refresh_tab', 'resume_plan', 'cancel_plan'])
    const threadId = principal.type === 'root' ? principal.threadId : principal.parentThreadId
    if (allowed.has(operation.operation) && target?.kind === 'zyra-browser' && target.ownerThreadId === threadId) return operation
    throw new AgentControlError('CONTROL_DRIVER_UNAVAILABLE', 'Background chats can control their own in-app Browser tabs. Select the chat to use controls that change the visible workspace or Windows focus.')
}
