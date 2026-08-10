export function shouldAutoReconnectAssistantThread(input: {
    threadState?: string | null
    hasRecoverableIssue: boolean
}): boolean {
    const { threadState, hasRecoverableIssue } = input
    if (hasRecoverableIssue || !threadState) return true

    return threadState === 'disconnected'
        || threadState === 'idle'
        || threadState === 'ready'
        || threadState === 'running'
        || threadState === 'waiting'
}
