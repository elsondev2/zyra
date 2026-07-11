import {
    measureLineStats,
    prepare,
    prepareWithSegments
} from '@chenglou/pretext'
import {
    measureRichInlineStats,
    prepareRichInline,
    type RichInlineItem
} from '@chenglou/pretext/rich-inline'

type WhiteSpaceMode = 'normal' | 'pre-wrap'
type WordBreakMode = 'normal' | 'keep-all'

type MeasureTextInput = {
    text: string
    font: string
    lineHeight: number
    maxWidth: number
    whiteSpace?: WhiteSpaceMode
    wordBreak?: WordBreakMode
    clampToAtLeastOneLine?: boolean
}

type MeasureRichInlineInput = {
    items: RichInlineItem[]
    lineHeight: number
    maxWidth: number
    clampToAtLeastOneLine?: boolean
}

export type TextLayoutMetrics = {
    height: number
    lineCount: number
    maxLineWidth: number
}

const PREPARED_TEXT_CACHE_LIMIT = 180
const PREPARED_SEGMENT_CACHE_LIMIT = 180
const PREPARED_RICH_INLINE_CACHE_LIMIT = 120

const preparedTextCache = new Map<string, ReturnType<typeof prepare>>()
const preparedSegmentCache = new Map<string, ReturnType<typeof prepareWithSegments>>()
const preparedRichInlineCache = new Map<string, ReturnType<typeof prepareRichInline>>()

function touchLruValue<T>(cache: Map<string, T>, key: string, value: T, limit: number): T {
    if (cache.has(key)) cache.delete(key)
    cache.set(key, value)

    while (cache.size > limit) {
        const oldestKey = cache.keys().next().value
        if (!oldestKey) break
        cache.delete(oldestKey)
    }

    return value
}

function getTextCacheKey(text: string, font: string, whiteSpace: WhiteSpaceMode, wordBreak: WordBreakMode): string {
    return `${font}::${whiteSpace}::${wordBreak}::${text}`
}

function getRichInlineCacheKey(items: RichInlineItem[]): string {
    return JSON.stringify(items)
}

export function getPreparedText(
    text: string,
    font: string,
    whiteSpace: WhiteSpaceMode = 'normal',
    wordBreak: WordBreakMode = 'normal'
) {
    const cacheKey = getTextCacheKey(text, font, whiteSpace, wordBreak)
    const cached = preparedTextCache.get(cacheKey)
    if (cached) return touchLruValue(preparedTextCache, cacheKey, cached, PREPARED_TEXT_CACHE_LIMIT)

    return touchLruValue(
        preparedTextCache,
        cacheKey,
        prepare(text, font, { whiteSpace, wordBreak }),
        PREPARED_TEXT_CACHE_LIMIT
    )
}

export function getPreparedSegmentText(
    text: string,
    font: string,
    whiteSpace: WhiteSpaceMode = 'normal',
    wordBreak: WordBreakMode = 'normal'
) {
    const cacheKey = getTextCacheKey(text, font, whiteSpace, wordBreak)
    const cached = preparedSegmentCache.get(cacheKey)
    if (cached) return touchLruValue(preparedSegmentCache, cacheKey, cached, PREPARED_SEGMENT_CACHE_LIMIT)

    return touchLruValue(
        preparedSegmentCache,
        cacheKey,
        prepareWithSegments(text, font, { whiteSpace, wordBreak }),
        PREPARED_SEGMENT_CACHE_LIMIT
    )
}

export function measureTextLayout({
    text,
    font,
    lineHeight,
    maxWidth,
    whiteSpace = 'normal',
    wordBreak = 'normal',
    clampToAtLeastOneLine = true
}: MeasureTextInput): TextLayoutMetrics {
    const normalizedWidth = Math.max(1, Math.floor(maxWidth))
    const prepared = getPreparedSegmentText(text, font, whiteSpace, wordBreak)
    const stats = measureLineStats(prepared, normalizedWidth)
    const safeLineCount = clampToAtLeastOneLine
        ? Math.max(1, stats.lineCount)
        : Math.max(0, stats.lineCount)

    return {
        height: safeLineCount * lineHeight,
        lineCount: safeLineCount,
        maxLineWidth: stats.maxLineWidth
    }
}

export function getPreparedRichInline(items: RichInlineItem[]) {
    const cacheKey = getRichInlineCacheKey(items)
    const cached = preparedRichInlineCache.get(cacheKey)
    if (cached) return touchLruValue(preparedRichInlineCache, cacheKey, cached, PREPARED_RICH_INLINE_CACHE_LIMIT)

    return touchLruValue(
        preparedRichInlineCache,
        cacheKey,
        prepareRichInline(items),
        PREPARED_RICH_INLINE_CACHE_LIMIT
    )
}

export function measureRichInlineLayout({
    items,
    lineHeight,
    maxWidth,
    clampToAtLeastOneLine = true
}: MeasureRichInlineInput): TextLayoutMetrics {
    const normalizedWidth = Math.max(1, Math.floor(maxWidth))
    const prepared = getPreparedRichInline(items)
    const stats = measureRichInlineStats(prepared, normalizedWidth)
    const safeLineCount = clampToAtLeastOneLine
        ? Math.max(1, stats.lineCount)
        : Math.max(0, stats.lineCount)

    return {
        height: safeLineCount * lineHeight,
        lineCount: safeLineCount,
        maxLineWidth: stats.maxLineWidth
    }
}
