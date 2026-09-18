export function createFontPreviewQueue(limit = 2) {
    let active = 0
    const waiting: Array<() => void> = []
    return async function run<T>(task: () => Promise<T>): Promise<T> {
        if (active >= limit) await new Promise<void>(resolve => waiting.push(resolve))
        else active += 1
        try { return await task() }
        finally {
            const next = waiting.shift()
            // Transfer the occupied slot directly; a new arrival cannot steal it.
            if (next) next()
            else active -= 1
        }
    }
}

export function fontRangeContainsAscii(range?: string): boolean {
    if (!range) return true
    return range.split(',').some(part => {
        const match = part.trim().match(/^U\+([\dA-F?]+)(?:-([\dA-F]+))?$/i)
        if (!match) return false
        const start = parseInt(match[1].replaceAll('?', '0'), 16)
        const end = parseInt(match[2] || match[1].replaceAll('?', 'F'), 16)
        return start <= 65 && end >= 122
    })
}
