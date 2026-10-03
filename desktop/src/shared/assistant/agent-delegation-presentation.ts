/** Recognize only the exact old envelope in a proven agent-created thread. */
export function readLegacyAgentDelegation(text: string, senderCanonicalThreadId?: string | null): string | null {
    if (!senderCanonicalThreadId) return null
    const match = /^Delegated goal: ([\s\S]+)\n\nAttempt: \d+ \([0-9a-f-]{36}\)\n\nReturn only the bounded work result and evidence\. Parent policy remains authoritative\.$/i.exec(text)
    // A goal can contain paragraphs. Only the known trailing envelope fields
    // delimit the goal; ordinary blank lines must remain part of the task.
    return match?.[1]?.split(/\n\n(?:Success criteria|Read scope|Write scope|Delegated control lease):/)[0]?.trim() || null
}
