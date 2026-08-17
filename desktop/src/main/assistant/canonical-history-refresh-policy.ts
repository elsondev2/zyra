export class CanonicalHistoryRefreshTracker {
    private readonly generations = new Map<string, number>()

    mark(canonicalChatId: string): number {
        const generation = (this.generations.get(canonicalChatId) || 0) + 1
        this.generations.set(canonicalChatId, generation)
        return generation
    }

    current(canonicalChatId: string): number {
        return this.generations.get(canonicalChatId) || 0
    }

    clearIfCurrent(canonicalChatId: string, generation: number): boolean {
        if (this.current(canonicalChatId) !== generation) return false
        this.generations.delete(canonicalChatId)
        return true
    }

    clear(): void {
        this.generations.clear()
    }
}

export function shouldRefreshCanonicalHistory(input: {
    canonicalModifiedAt: string
    persistedCanonicalModifiedAt?: string | null
    canonicalEntryCount?: number | null
    persistedCanonicalEntryCount?: number | null
}): boolean {
    const canonicalModifiedAt = Date.parse(input.canonicalModifiedAt)
    const persistedModifiedAt = Date.parse(input.persistedCanonicalModifiedAt || '')
    const canonicalEntryCount = Number(input.canonicalEntryCount)
    const persistedEntryCount = Number(input.persistedCanonicalEntryCount)

    if (!Number.isFinite(persistedModifiedAt)) return true
    if (Number.isFinite(canonicalModifiedAt) && canonicalModifiedAt !== persistedModifiedAt) return true
    if (Number.isFinite(canonicalEntryCount) && canonicalEntryCount !== persistedEntryCount) return true
    return false
}
