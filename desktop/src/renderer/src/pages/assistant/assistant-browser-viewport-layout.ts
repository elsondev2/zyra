import {
    ASSISTANT_BROWSER_VIEWPORT_MAX,
    ASSISTANT_BROWSER_VIEWPORT_MAX_AREA,
    ASSISTANT_BROWSER_VIEWPORT_MIN,
    type AssistantBrowserViewportSetting
} from './assistant-browser-workspace-state'

export const ASSISTANT_BROWSER_DEVICE_TOOLBAR_HEIGHT = 32
export const ASSISTANT_BROWSER_VIEWPORT_RAIL_SIZE = 10

export type AssistantBrowserViewportResizeDirection =
    | 'west'
    | 'east'
    | 'south'
    | 'southwest'
    | 'southeast'

export type AssistantBrowserViewportLayout = {
    width: number
    height: number
    x: number
    y: number
    visibleWidth: number
    visibleHeight: number
    scale: number
    fillsPanel: boolean
}

function clampedDimension(value: number): number {
    return Math.min(ASSISTANT_BROWSER_VIEWPORT_MAX, Math.max(ASSISTANT_BROWSER_VIEWPORT_MIN, Math.round(value)))
}

export function clampAssistantBrowserViewportSize(width: number, height: number): { width: number; height: number } {
    let nextWidth = clampedDimension(width)
    let nextHeight = clampedDimension(height)
    if (nextWidth * nextHeight <= ASSISTANT_BROWSER_VIEWPORT_MAX_AREA) {
        return { width: nextWidth, height: nextHeight }
    }
    const scale = Math.sqrt(ASSISTANT_BROWSER_VIEWPORT_MAX_AREA / (nextWidth * nextHeight))
    nextWidth = clampedDimension(Math.floor(nextWidth * scale))
    nextHeight = clampedDimension(Math.floor(nextHeight * scale))
    return { width: nextWidth, height: nextHeight }
}

export function resolveAssistantBrowserViewportLayout(
    container: { width: number; height: number },
    setting: AssistantBrowserViewportSetting,
    _zoomFactor = 1
): AssistantBrowserViewportLayout {
    const width = Math.max(1, Math.round(container.width))
    const height = Math.max(1, Math.round(container.height))
    if (setting.mode === 'fill') {
        return { width, height, x: 0, y: 0, visibleWidth: width, visibleHeight: height, scale: 1, fillsPanel: true }
    }
    const availableWidth = Math.max(1, width - ASSISTANT_BROWSER_VIEWPORT_RAIL_SIZE * 2)
    const availableHeight = Math.max(1, height - ASSISTANT_BROWSER_VIEWPORT_RAIL_SIZE)
    // Electron page zoom changes the guest's CSS coordinate space, not the
    // requested device-frame footprint. Fit only the requested dimensions.
    const scale = Math.min(1, availableWidth / setting.width, availableHeight / setting.height)
    const visibleWidth = setting.width * scale
    const visibleHeight = setting.height * scale
    return {
        width: setting.width,
        height: setting.height,
        x: Math.max(ASSISTANT_BROWSER_VIEWPORT_RAIL_SIZE, Math.round((width - visibleWidth) / 2)),
        y: Math.max(0, Math.round((height - visibleHeight) / 2)),
        visibleWidth,
        visibleHeight,
        scale,
        fillsPanel: false
    }
}

function resizeAtRatio(value: number, ratio: number, axis: 'width' | 'height') {
    const desiredWidth = axis === 'width' ? value : value * ratio
    const desiredHeight = axis === 'height' ? value : value / ratio
    return clampAssistantBrowserViewportSize(desiredWidth, desiredHeight)
}

export function resizeAssistantBrowserViewport(
    start: { width: number; height: number },
    delta: { x: number; y: number },
    direction: AssistantBrowserViewportResizeDirection,
    presentationScale: number,
    aspectRatio: number | null
): { width: number; height: number } {
    const scale = Number.isFinite(presentationScale) && presentationScale > 0 ? presentationScale : 1
    const horizontal = direction.includes('east')
        ? delta.x / scale
        : direction.includes('west')
            ? -delta.x / scale
            : 0
    const vertical = direction.includes('south') ? delta.y / scale : 0
    if (aspectRatio && Number.isFinite(aspectRatio) && aspectRatio > 0) {
        const horizontalWeight = Math.abs(horizontal / Math.max(1, start.width))
        const verticalWeight = Math.abs(vertical / Math.max(1, start.height))
        return horizontalWeight >= verticalWeight
            ? resizeAtRatio(start.width + horizontal, aspectRatio, 'width')
            : resizeAtRatio(start.height + vertical, aspectRatio, 'height')
    }
    return clampAssistantBrowserViewportSize(start.width + horizontal, start.height + vertical)
}
