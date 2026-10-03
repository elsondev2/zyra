/** External harness turns retain their detached principal even if the chat is opened. */
export function selectDesktopControlWorker<T extends { localThreadId: string | null }>(
    candidates: T[],
    requestLocalThreadId: unknown,
    externalToolSessionId: unknown
): T | undefined {
    if (typeof externalToolSessionId === 'string' && externalToolSessionId.startsWith('external-tool:')) return undefined
    if (typeof requestLocalThreadId === 'string' && requestLocalThreadId) {
        return candidates.find(candidate => candidate.localThreadId === requestLocalThreadId)
    }
    for (let index = candidates.length - 1; index >= 0; index--) {
        if (candidates[index].localThreadId) return candidates[index]
    }
    return undefined
}
