export type AssistantQueuePreviewCommand = {
    prompt: string
    count: number
    dispatchMode: 'queue' | 'force'
}

const QUEUE_PREVIEW_FLAGS = ['/queue-test', '/queue-preview']
const MAX_QUEUE_PREVIEW_COUNT = 6

function clampPreviewCount(count: number): number {
    if (!Number.isFinite(count)) return 1
    return Math.max(1, Math.min(MAX_QUEUE_PREVIEW_COUNT, Math.floor(count)))
}

export function parseDevAssistantQueuePreviewCommand(input: string): AssistantQueuePreviewCommand | null {
    if (!import.meta.env.DEV) return null

    const trimmed = input.trim()
    const flag = QUEUE_PREVIEW_FLAGS.find((candidate) => trimmed === candidate || trimmed.startsWith(`${candidate} `))
    if (!flag) return null

    let count = 1
    let dispatchMode: 'queue' | 'force' = 'queue'
    const bodyParts: string[] = []

    for (const token of trimmed.slice(flag.length).trim().split(/\s+/).filter(Boolean)) {
        const countMatch = token.match(/^--(?:count|items)=(\d+)$/i)
        if (countMatch) {
            count = clampPreviewCount(Number(countMatch[1]))
            continue
        }
        if (token === '--force') {
            dispatchMode = 'force'
            continue
        }
        if (token === '--queue') {
            dispatchMode = 'queue'
            continue
        }
        bodyParts.push(token)
    }

    return {
        prompt: bodyParts.join(' ').trim() || 'Queued preview message',
        count,
        dispatchMode
    }
}
