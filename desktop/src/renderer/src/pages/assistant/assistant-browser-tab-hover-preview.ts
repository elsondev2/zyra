export async function captureAssistantBrowserTabHoverPreview(tabId: string): Promise<string | null> {
    try {
        const result = await window.devscope.browserView.command({ tabId, type: 'capture' })
        return result.success ? result.snapshotDataUrl || null : null
    } catch {
        return null
    }
}
