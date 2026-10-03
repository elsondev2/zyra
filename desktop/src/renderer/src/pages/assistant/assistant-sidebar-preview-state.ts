export const ASSISTANT_BUBBLE_PREVIEW_PINNED_KEY = 'assistant:bubble-preview-pinned:v1'
export const ASSISTANT_BUBBLE_SIDEBAR_WIDTH = 322
export const ASSISTANT_SIDEBAR_PREVIEW_CLOSE_MS = 180
export const ASSISTANT_SIDEBAR_COLLAPSE_MORPH_MS = 1_100

export function shouldCloseAssistantSidebarPreview(input: { previewPinned: boolean; pointerInside: boolean; nativeOverlayActive: boolean }): boolean {
    return !input.previewPinned && !input.pointerInside && !input.nativeOverlayActive
}

/** The outer native border is still part of the edge-hover interaction. */
export function isAssistantSidebarWindowEdgePoint(input: {
    clientX: number
    clientY: number
    viewportWidth: number
    edgeBounds: { left: number; right: number; top: number; bottom: number }
}): boolean {
    const { clientX, clientY, viewportWidth, edgeBounds } = input
    if (clientY < edgeBounds.top || clientY >= edgeBounds.bottom) return false
    // One CSS pixel covers the native/client seam without retaining hover once
    // the pointer has actually moved away from this window.
    return (edgeBounds.left <= 0 && clientX >= -1 && clientX <= 1)
        || (edgeBounds.right >= viewportWidth && clientX >= viewportWidth - 1 && clientX <= viewportWidth + 1)
}

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
