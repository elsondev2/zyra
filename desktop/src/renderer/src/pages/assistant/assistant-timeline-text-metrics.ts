import { measureTextLayout } from '@/lib/text-layout/pretext'

export const TIMELINE_TEXT_FONT = '400 13px Inter'
export const TIMELINE_TEXT_LINE_HEIGHT = 24
export const USER_MESSAGE_COLLAPSED_LINE_COUNT = 9

const DEFAULT_TIMELINE_CONTAINER_WIDTH = 960
const ASSISTANT_MESSAGE_MAX_WIDTH = 896
const USER_MESSAGE_BUBBLE_MAX_WIDTH = 576
const PLAN_CARD_MAX_WIDTH = 896
const MESSAGE_HORIZONTAL_GUTTER = 24
const CONTENT_HORIZONTAL_PADDING = 32

function normalizeContainerWidth(containerWidth?: number | null): number {
    return Math.max(320, Math.floor(containerWidth || DEFAULT_TIMELINE_CONTAINER_WIDTH))
}

export function getAssistantMessageWidth(containerWidth?: number | null): number {
    return Math.max(
        280,
        Math.min(normalizeContainerWidth(containerWidth) - MESSAGE_HORIZONTAL_GUTTER, ASSISTANT_MESSAGE_MAX_WIDTH)
    )
}

export function getPlanCardContentWidth(containerWidth?: number | null): number {
    const outerWidth = Math.max(
        320,
        Math.min(normalizeContainerWidth(containerWidth) - MESSAGE_HORIZONTAL_GUTTER, PLAN_CARD_MAX_WIDTH)
    )
    return Math.max(260, outerWidth - CONTENT_HORIZONTAL_PADDING)
}

export function getUserMessageBodyWidth(containerWidth?: number | null): number {
    const bubbleWidth = Math.max(
        240,
        Math.min(normalizeContainerWidth(containerWidth) - MESSAGE_HORIZONTAL_GUTTER, USER_MESSAGE_BUBBLE_MAX_WIDTH)
    )
    return Math.max(180, bubbleWidth - CONTENT_HORIZONTAL_PADDING)
}

export function measureTimelinePlainTextHeight(
    text: string,
    maxWidth: number,
    whiteSpace: 'normal' | 'pre-wrap' = 'normal'
): { height: number; lineCount: number } {
    const metrics = measureTextLayout({
        text,
        font: TIMELINE_TEXT_FONT,
        lineHeight: TIMELINE_TEXT_LINE_HEIGHT,
        maxWidth,
        whiteSpace,
        clampToAtLeastOneLine: true
    })

    return {
        height: Math.max(TIMELINE_TEXT_LINE_HEIGHT, Math.ceil(metrics.height)),
        lineCount: metrics.lineCount
    }
}

export function estimateAttachmentGridHeight(attachmentCount: number, _bodyWidth: number): number {
    if (attachmentCount <= 0) return 0

    const attachmentRowHeight = 84
    const rowGap = 4
    const rowCount = attachmentCount

    return rowCount * attachmentRowHeight + Math.max(0, rowCount - 1) * rowGap + 6
}
