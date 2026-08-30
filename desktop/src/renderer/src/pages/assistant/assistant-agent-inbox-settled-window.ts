export const ASSISTANT_AGENT_INBOX_SETTLED_ROW_PITCH_PX = 37

export function resolveAssistantAgentInboxSettledInitialCount(
    availableHeight: number,
    rowPitch = ASSISTANT_AGENT_INBOX_SETTLED_ROW_PITCH_PX
): number {
    if (!Number.isFinite(availableHeight) || !Number.isFinite(rowPitch) || rowPitch <= 0) return 1
    return Math.max(1, Math.ceil(Math.max(0, availableHeight) / rowPitch))
}
