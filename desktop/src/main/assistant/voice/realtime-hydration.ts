import { createHash } from 'node:crypto'
import type {
    ForegroundRouteClaim,
    RealtimeHydrationDelta,
    RealtimeHydrationItem,
    RealtimeHydrationSeed,
    RealtimeHydrationWatermarks
} from '../../../shared/assistant/contracts'

const MAX_HYDRATION_BYTES = 32 * 1024
const MAX_HYDRATION_ITEMS = 256
const WATERMARK_KEYS = ['conversation', 'foregroundRoutes', 'context', 'tasks', 'operations', 'narration'] as const

export function createRealtimeHydrationSeed(input: {
    packetId: string
    conversationId: string
    contextVersion: number
    activeRouteClaim: ForegroundRouteClaim
    sourceWatermarks: RealtimeHydrationWatermarks
    items: RealtimeHydrationItem[]
    retrievalReferenceIds?: string[]
    generatedAt: string
}): RealtimeHydrationSeed {
    const seed: RealtimeHydrationSeed = {
        schemaVersion: 1,
        packetId: input.packetId,
        conversationId: input.conversationId,
        contextVersion: input.contextVersion,
        activeRouteClaim: structuredClone(input.activeRouteClaim),
        sourceWatermarks: structuredClone(input.sourceWatermarks),
        items: structuredClone(input.items),
        retrievalReferenceIds: [...(input.retrievalReferenceIds || [])],
        generatedAt: input.generatedAt,
        canonicalSha256: ''
    }
    seed.canonicalSha256 = hydrationDigest(seed)
    return validateRealtimeHydrationSeed(seed)
}

export function createRealtimeHydrationDelta(input: {
    deltaId: string
    basePacketId: string
    conversationId: string
    fromWatermarks: RealtimeHydrationWatermarks
    toWatermarks: RealtimeHydrationWatermarks
    items: RealtimeHydrationItem[]
    generatedAt: string
}): RealtimeHydrationDelta {
    const delta: RealtimeHydrationDelta = {
        schemaVersion: 1,
        deltaId: input.deltaId,
        basePacketId: input.basePacketId,
        conversationId: input.conversationId,
        fromWatermarks: structuredClone(input.fromWatermarks),
        toWatermarks: structuredClone(input.toWatermarks),
        items: structuredClone(input.items),
        generatedAt: input.generatedAt,
        canonicalSha256: ''
    }
    delta.canonicalSha256 = hydrationDigest(delta)
    return validateRealtimeHydrationDelta(delta)
}

export function validateRealtimeHydrationSeed(seed: RealtimeHydrationSeed): RealtimeHydrationSeed {
    if (seed.schemaVersion !== 1) throw new Error(`Unsupported realtime hydration seed version ${seed.schemaVersion}.`)
    assertText(seed.packetId, 'packetId')
    assertText(seed.conversationId, 'conversationId')
    assertSafeInteger(seed.contextVersion, 'contextVersion')
    if (seed.activeRouteClaim.conversationId !== seed.conversationId) {
        throw new Error('Hydration route claim belongs to another canonical conversation.')
    }
    validateWatermarks(seed.sourceWatermarks)
    validateItems(seed.items, seed.conversationId)
    parseTimestamp(seed.generatedAt, 'generatedAt')
    assertDigest(seed)
    assertHydrationBytes(seed)
    return seed
}

export function validateRealtimeHydrationDelta(delta: RealtimeHydrationDelta): RealtimeHydrationDelta {
    if (delta.schemaVersion !== 1) throw new Error(`Unsupported realtime hydration delta version ${delta.schemaVersion}.`)
    assertText(delta.deltaId, 'deltaId')
    assertText(delta.basePacketId, 'basePacketId')
    assertText(delta.conversationId, 'conversationId')
    validateWatermarks(delta.fromWatermarks)
    validateWatermarks(delta.toWatermarks)
    for (const key of WATERMARK_KEYS) {
        if (delta.toWatermarks[key] < delta.fromWatermarks[key]) {
            throw new Error(`Hydration watermark ${key} cannot regress.`)
        }
    }
    validateItems(delta.items, delta.conversationId)
    parseTimestamp(delta.generatedAt, 'generatedAt')
    assertDigest(delta)
    assertHydrationBytes(delta)
    return delta
}

export function applyRealtimeHydrationDelta(
    seed: RealtimeHydrationSeed,
    current: RealtimeHydrationWatermarks,
    delta: RealtimeHydrationDelta
): RealtimeHydrationWatermarks {
    validateRealtimeHydrationSeed(seed)
    validateRealtimeHydrationDelta(delta)
    if (delta.basePacketId !== seed.packetId || delta.conversationId !== seed.conversationId) {
        throw new Error('Hydration delta identity does not match its base seed.')
    }
    for (const key of WATERMARK_KEYS) {
        if (delta.fromWatermarks[key] !== current[key]) {
            throw new Error(`Hydration delta has a ${key} watermark gap.`)
        }
    }
    return structuredClone(delta.toWatermarks)
}

export function hydrationDigest(value: RealtimeHydrationSeed | RealtimeHydrationDelta): string {
    const withoutHash = { ...value, canonicalSha256: undefined }
    return createHash('sha256').update(stableJson(withoutHash)).digest('hex')
}

function validateItems(items: RealtimeHydrationItem[], conversationId: string): void {
    if (!Array.isArray(items) || items.length > MAX_HYDRATION_ITEMS) throw new Error('Realtime hydration item limit exceeded.')
    const itemIds = new Set<string>()
    const messageIds = new Set<string>()
    for (const [index, item] of items.entries()) {
        assertText(item.itemId, `items[${index}].itemId`)
        if (itemIds.has(item.itemId)) throw new Error(`Duplicate hydration item ${item.itemId}.`)
        itemIds.add(item.itemId)
        if (!['developer', 'user', 'assistant'].includes(item.role)) throw new Error(`Invalid hydration item role ${item.role}.`)
        if (!item.text || item.text.length > 16_384) throw new Error('Hydration item text is empty or too large.')
        if (item.canonicalMessageId) {
            if (messageIds.has(item.canonicalMessageId)) throw new Error(`Duplicate canonical message ${item.canonicalMessageId}.`)
            messageIds.add(item.canonicalMessageId)
            if (!Number.isSafeInteger(item.conversationSequence) || (item.conversationSequence as number) < 1) {
                throw new Error('Canonical hydration messages require a positive conversation sequence.')
            }
        } else if (item.conversationSequence !== null) {
            throw new Error('Non-message hydration items cannot claim a canonical conversation sequence.')
        }
    }
    if (!conversationId) throw new Error('Hydration conversation identity is required.')
}

function validateWatermarks(watermarks: RealtimeHydrationWatermarks): void {
    for (const key of WATERMARK_KEYS) assertSafeInteger(watermarks[key], `watermarks.${key}`)
}

function assertDigest(value: RealtimeHydrationSeed | RealtimeHydrationDelta): void {
    if (!/^[a-f0-9]{64}$/.test(value.canonicalSha256) || value.canonicalSha256 !== hydrationDigest(value)) {
        throw new Error('Realtime hydration integrity hash does not match its contents.')
    }
}

function assertHydrationBytes(value: RealtimeHydrationSeed | RealtimeHydrationDelta): void {
    const bytes = Buffer.byteLength(JSON.stringify(value), 'utf8')
    if (bytes > MAX_HYDRATION_BYTES) throw new Error(`Realtime hydration value exceeds ${MAX_HYDRATION_BYTES} bytes.`)
}

function stableJson(value: unknown): string {
    if (value === undefined) return 'null'
    if (value === null || typeof value !== 'object') return JSON.stringify(value) as string
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
        .join(',')}}`
}

function assertText(value: unknown, name: string): asserts value is string {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`)
}

function assertSafeInteger(value: unknown, name: string): asserts value is number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${name} must be a nonnegative safe integer.`)
}

function parseTimestamp(value: unknown, name: string): number {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error(`${name} must be an ISO date-time.`)
    return Date.parse(value)
}
