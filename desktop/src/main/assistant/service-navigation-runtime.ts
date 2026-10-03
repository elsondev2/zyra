import type { AssistantThread } from '../../shared/assistant/contracts'
import { isAssistantThreadProjectWarmupOnly } from '../../shared/assistant/session-project'
import { isCanonicalPresenceActive } from './service-canonical-presence'
import type { AssistantServiceActionDeps } from './service-action-deps'
import { getAssistantCanonicalThreadId } from './thread-identity'

export function shouldKeepAssistantThreadAttachedDuringNavigation(thread: AssistantThread): boolean {
    if (thread.latestTurn?.state === 'running' || isCanonicalPresenceActive(thread.canonicalPresence)) return true
    if (thread.hasPendingApprovals || thread.hasPendingUserInputs) return true
    if (thread.pendingApprovals.some((entry) => entry.status === 'pending')) return true
    if (thread.pendingUserInputs.some((entry) => entry.status === 'pending')) return true
    if (thread.state === 'starting' && !isAssistantThreadProjectWarmupOnly(thread)) return true
    if (thread.canonicalPresence?.state === 'ready') return false
    return thread.state === 'running' || thread.state === 'waiting'
}

export function leaveAssistantThreadForNavigation(deps: AssistantServiceActionDeps, thread: AssistantThread): void {
    if (shouldKeepAssistantThreadAttachedDuringNavigation(thread)) {
        deps.runtime.setNavigationBackgrounded?.(thread.id, true)
        return
    }
    deps.runtime.disconnect(getAssistantCanonicalThreadId(thread), { preserveThreadState: true })
}
