export function schedulePreviewWork(
    work: () => void,
    preferIdle: boolean
): () => void {
    let cancelled = false
    if (preferIdle && typeof window.requestIdleCallback === 'function') {
        const idleId = window.requestIdleCallback(() => {
            if (!cancelled) work()
        }, { timeout: 180 })
        return () => {
            cancelled = true
            window.cancelIdleCallback(idleId)
        }
    }

    const timeoutId = window.setTimeout(() => {
        if (!cancelled) work()
    }, 0)
    return () => {
        cancelled = true
        window.clearTimeout(timeoutId)
    }
}
