const BROWSER_SLOT_REVISION_KEY = '__zyraAssistantBrowserSlotRevisionV1'

type BrowserSlotRevisionHost = Record<string, number | undefined>

export function nextAssistantBrowserSlotRevision(
    host: object,
    nowMilliseconds = Date.now()
): number {
    const revisionHost = host as BrowserSlotRevisionHost
    const clockRevision = Math.max(1, Math.floor(nowMilliseconds) * 1_000)
    const previousRevision = Number(revisionHost[BROWSER_SLOT_REVISION_KEY]) || 0
    const nextRevision = Math.max(clockRevision, previousRevision + 1)
    revisionHost[BROWSER_SLOT_REVISION_KEY] = nextRevision
    return nextRevision
}
