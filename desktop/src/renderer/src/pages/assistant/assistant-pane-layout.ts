export const ASSISTANT_MIN_CONVERSATION_WIDTH = 440
export const ASSISTANT_MIN_LEFT_SIDEBAR_WIDTH = 260
export const ASSISTANT_MAX_LEFT_SIDEBAR_WIDTH = 420
export const ASSISTANT_MIN_INSPECTOR_WIDTH = 340
export const ASSISTANT_MAX_INSPECTOR_VIEWPORT_RATIO = 0.75
export const ASSISTANT_TIMELINE_COMPOSER_GAP_PX = 16
export const ASSISTANT_COMPOSER_OVERLAY_TOP_PADDING_PX = 40
export const ASSISTANT_MIN_BOTTOM_COMPOSER_INSET_PX = 144
export const ASSISTANT_LEFT_SIDEBAR_WIDTH_STORAGE_KEY = 'assistant-left-sidebar-width'

type AssistantPaneLayoutInput = {
    viewportWidth: number
    leftSidebarCollapsed: boolean
    leftSidebarWidth: number
    inspectorOpen: boolean
    inspectorWidth: number
}

export type AssistantPaneLayout = {
    autoCollapseLeftSidebar: boolean
    leftSidebarCollapsed: boolean
    leftSidebarWidth: number
    maxLeftSidebarWidth: number
    inspectorWidth: number
    maxInspectorWidth: number
    conversationWidth: number
}

function clampWidth(width: number, minimum: number, maximum: number): number {
    const resolvedMaximum = Math.max(minimum, Math.round(maximum))
    return Math.max(minimum, Math.min(resolvedMaximum, Math.round(width)))
}

export function resolveAssistantLeftSidebarWidth(
    width: number,
    maximum = ASSISTANT_MAX_LEFT_SIDEBAR_WIDTH
): number {
    const resolvedMaximum = Math.min(ASSISTANT_MAX_LEFT_SIDEBAR_WIDTH, maximum)
    return clampWidth(width || 322, ASSISTANT_MIN_LEFT_SIDEBAR_WIDTH, resolvedMaximum)
}

export function resolveStoredAssistantLeftSidebarWidth(value: string | null): number {
    const storedWidth = Number(value)
    return resolveAssistantLeftSidebarWidth(Number.isFinite(storedWidth) && storedWidth > 0 ? storedWidth : 322)
}

export function resolveAssistantComposerInsetEnd(input: {
    paneTop: number
    paneBottom: number
    attachmentShelfTop?: number | null
    contentTopInset?: number
    gap?: number
}): number {
    const contentTop = input.paneTop + Math.max(0, input.contentTopInset || 0)
    const shelfTop = typeof input.attachmentShelfTop === 'number' && Number.isFinite(input.attachmentShelfTop)
        ? input.attachmentShelfTop
        : contentTop
    const occupiedTop = Math.min(contentTop, shelfTop)
    const occupiedHeight = Math.max(0, input.paneBottom - occupiedTop)
    return Math.ceil(occupiedHeight) + Math.max(0, input.gap ?? ASSISTANT_TIMELINE_COMPOSER_GAP_PX)
}

export function resolveAssistantStableComposerInsetEnd(measuredInset: number, overlayActive: boolean): number {
    if (!overlayActive) return 0
    return Math.max(ASSISTANT_MIN_BOTTOM_COMPOSER_INSET_PX, Math.ceil(Math.max(0, measuredInset)))
}

export function resolveAssistantScrollButtonBottom(
    contentInsetEndAdjustment: number,
    elevated: boolean
): number {
    return elevated ? Math.max(16, contentInsetEndAdjustment - 8) : 16
}

export function resolveAssistantPaneLayout(input: AssistantPaneLayoutInput): AssistantPaneLayout {
    const viewportWidth = Math.max(0, Math.round(input.viewportWidth))
    const desiredLeftSidebarWidth = resolveAssistantLeftSidebarWidth(input.leftSidebarWidth)
    const viewportInspectorLimit = Math.floor(viewportWidth * ASSISTANT_MAX_INSPECTOR_VIEWPORT_RATIO)
    const desiredInspectorWidth = input.inspectorOpen
        ? clampWidth(input.inspectorWidth || 420, ASSISTANT_MIN_INSPECTOR_WIDTH, viewportInspectorLimit)
        : 0
    const autoCollapseLeftSidebar = input.inspectorOpen
        && desiredLeftSidebarWidth + desiredInspectorWidth + ASSISTANT_MIN_CONVERSATION_WIDTH > viewportWidth
    const leftSidebarCollapsed = input.leftSidebarCollapsed || autoCollapseLeftSidebar
    const activeLeftSidebarWidth = leftSidebarCollapsed ? 0 : desiredLeftSidebarWidth
    const maxInspectorWidth = Math.max(
        ASSISTANT_MIN_INSPECTOR_WIDTH,
        Math.min(viewportInspectorLimit, viewportWidth - activeLeftSidebarWidth - ASSISTANT_MIN_CONVERSATION_WIDTH)
    )
    const inspectorWidth = input.inspectorOpen
        ? clampWidth(desiredInspectorWidth, ASSISTANT_MIN_INSPECTOR_WIDTH, maxInspectorWidth)
        : 0
    const maxLeftSidebarWidth = Math.max(
        ASSISTANT_MIN_LEFT_SIDEBAR_WIDTH,
        Math.min(
            ASSISTANT_MAX_LEFT_SIDEBAR_WIDTH,
            viewportWidth - inspectorWidth - ASSISTANT_MIN_CONVERSATION_WIDTH
        )
    )
    const leftSidebarWidth = leftSidebarCollapsed
        ? 0
        : clampWidth(desiredLeftSidebarWidth, ASSISTANT_MIN_LEFT_SIDEBAR_WIDTH, maxLeftSidebarWidth)

    return {
        autoCollapseLeftSidebar,
        leftSidebarCollapsed,
        leftSidebarWidth,
        maxLeftSidebarWidth,
        inspectorWidth,
        maxInspectorWidth,
        conversationWidth: Math.max(0, viewportWidth - leftSidebarWidth - inspectorWidth)
    }
}
