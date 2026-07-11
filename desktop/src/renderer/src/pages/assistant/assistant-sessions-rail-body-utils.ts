import type { SessionProjectGroup } from './assistant-sessions-rail-utils'
import { getPrimarySessionThread } from './assistant-sessions-rail-utils'

export function getGroupPrimaryThreadOrNull(group: SessionProjectGroup) {
    const firstSession = group.sessions[0]
    const primaryThread = firstSession ? getPrimarySessionThread(firstSession) : null
    if (!firstSession || !primaryThread) return null
    return { sessionId: firstSession.id, threadId: primaryThread.id }
}
