type ChatSnapshot = { sessions: Array<{ threads: Array<{ id: string; providerThreadId?: string | null }> }> }

/** Wait for canonical import only when the requested chat is missing locally. */
export async function ensureCanonicalChatAvailability(
    canonicalChatId: string,
    snapshot: () => ChatSnapshot,
    refresh: () => Promise<void>
): Promise<boolean> {
    const available = () => snapshot().sessions.some(session => session.threads.some(thread =>
        thread.providerThreadId === canonicalChatId || thread.id === canonicalChatId))
    if (available()) return true
    await refresh()
    return available()
}
