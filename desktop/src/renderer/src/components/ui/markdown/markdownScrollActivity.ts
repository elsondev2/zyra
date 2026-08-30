let markdownScrollBusyUntil = 0

export function markMarkdownScrollActivity(): void {
    markdownScrollBusyUntil = performance.now() + 140
}

export function isMarkdownScrollBusy(): boolean {
    return performance.now() < markdownScrollBusyUntil
}
