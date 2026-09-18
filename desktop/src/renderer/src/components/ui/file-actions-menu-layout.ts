export function resolveFileActionsMenuWidth(preferred: number, triggerWidth: number, viewportWidth: number, matchTriggerWidth: boolean): number {
    if (!matchTriggerWidth) return preferred
    const measured = Number.isFinite(triggerWidth) && triggerWidth > 0 ? triggerWidth : preferred
    return Math.min(measured, Math.max(1, viewportWidth - 24))
}
