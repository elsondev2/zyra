import { runtimeConnectionPresentation, type RuntimeActivationStatus } from '@shared/runtime-activation'

export function presentRuntimeConnection(state: RuntimeActivationStatus, now = Date.now()) {
    const presentation = runtimeConnectionPresentation(state, now)
    return {
        ...presentation,
        // Connection health is independent of whether the agent has newer code to apply.
        tone: presentation.live ? 'success' : presentation.tone,
        detail: state.connection === 'connected' && state.errorCode === 'AGENT_SERVER_HEARTBEAT_DELAYED'
            ? 'Connected · status delayed'
            : presentation.live ? state.updatePending ? 'Connected · agent update deferred' : 'Connected' : presentation.detail,
        message: presentation.live && state.updatePending
            ? state.errorCode === 'AGENT_SERVER_UPGRADE_BUSY'
                ? 'Your chats are connected. The agent update is deferred to avoid interrupting running chats.'
                : 'Your chats are connected. The background agent is still using earlier code.'
            : presentation.message
    }
}

export type RuntimeNotice = { title: string; message: string; tone: 'info' | 'warning' | 'danger' }

export function nextRuntimeNotice(previous: RuntimeNotice | null, state: RuntimeActivationStatus, now = Date.now()): RuntimeNotice | null {
    const presentation = presentRuntimeConnection(state, now)
    let next: RuntimeNotice | null
    if (presentation.live) {
        next = state.updatePending ? { title: 'Agent update deferred', message: presentation.message!, tone: 'info' } : null
    } else if (state.connection === 'connecting' || state.phase === 'checking' || state.phase === 'restarting') {
        // A reconnect attempt is not resolution. Keep the existing notification mounted.
        next = previous || state.phase === 'restarting'
            ? { title: 'Reconnecting to the agent', message: 'Checking the connection. Displayed activity may be out of date.', tone: 'warning' }
            : null
    } else if (presentation.message) {
        next = {
            title: state.connection === 'disconnected' ? 'Agent disconnected' : state.phase === 'failed' ? 'Agent connection failed' : 'Agent status is stale',
            message: presentation.message,
            tone: presentation.tone === 'danger' ? 'danger' : 'warning'
        }
    } else {
        next = previous
    }
    return previous?.title === next?.title && previous?.message === next?.message && previous?.tone === next?.tone ? previous : next
}
