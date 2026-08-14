export const ASSISTANT_BUBBLE_PREVIEW_PINNED_KEY = 'assistant:bubble-preview-pinned:v1'
export const ASSISTANT_SIDEBAR_PREVIEW_CLOSE_MS = 180
export const ASSISTANT_SIDEBAR_COLLAPSE_MORPH_MS = 1_100

export function readAssistantBubblePreviewPinned(): boolean {
    try {
        return localStorage.getItem(ASSISTANT_BUBBLE_PREVIEW_PINNED_KEY) === 'true'
    } catch {
        return false
    }
}

export function writeAssistantBubblePreviewPinned(pinned: boolean): void {
    try {
        localStorage.setItem(ASSISTANT_BUBBLE_PREVIEW_PINNED_KEY, String(pinned))
    } catch {
        // Keep the current renderer state when storage is unavailable.
    }
}
