export type AssistantDevContextCompactionTestMode = 'cycle' | 'running' | 'completed'

export type AssistantDevContextCompactionTestCommand = {
    mode: AssistantDevContextCompactionTestMode
    holdMs: number
    markerId?: string
}

const COMPACTION_TEST_FLAGS = ['/compact-test', '/compaction-test', '/context-compact-test']
const DEFAULT_COMPACTION_TEST_HOLD_MS = 1400
const MAX_COMPACTION_TEST_HOLD_MS = 10_000

function clampHoldMs(value: number): number {
    if (!Number.isFinite(value)) return DEFAULT_COMPACTION_TEST_HOLD_MS
    return Math.max(0, Math.min(MAX_COMPACTION_TEST_HOLD_MS, Math.floor(value)))
}

function normalizeMode(value: string): AssistantDevContextCompactionTestMode | null {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'cycle') return 'cycle'
    if (normalized === 'running' || normalized === 'compacting') return 'running'
    if (normalized === 'completed' || normalized === 'complete' || normalized === 'compacted' || normalized === 'done') return 'completed'
    return null
}

function sanitizeMarkerId(value: string): string | undefined {
    const sanitized = value.replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 64)
    return sanitized || undefined
}

export function parseDevContextCompactionTestCommand(
    input: string,
    options: { enabled: boolean }
): AssistantDevContextCompactionTestCommand | null {
    if (!options.enabled) return null

    const trimmed = input.trim()
    const flag = COMPACTION_TEST_FLAGS.find((candidate) => trimmed === candidate || trimmed.startsWith(`${candidate} `))
    if (!flag) return null

    let mode: AssistantDevContextCompactionTestMode = 'cycle'
    let holdMs = DEFAULT_COMPACTION_TEST_HOLD_MS
    let markerId: string | undefined

    for (const token of trimmed.slice(flag.length).trim().split(/\s+/).filter(Boolean)) {
        const modeMatch = token.match(/^--(?:mode|state)=(.+)$/i)
        if (modeMatch) {
            const nextMode = normalizeMode(modeMatch[1] || '')
            if (nextMode) mode = nextMode
            continue
        }

        const holdMatch = token.match(/^--(?:hold|delay|ms)=(\d+)$/i)
        if (holdMatch) {
            holdMs = clampHoldMs(Number(holdMatch[1]))
            continue
        }

        const idMatch = token.match(/^--id=(.+)$/i)
        if (idMatch) {
            markerId = sanitizeMarkerId(idMatch[1] || '')
            continue
        }

        const flagMode = token.startsWith('--') ? normalizeMode(token.slice(2)) : null
        if (flagMode) {
            mode = flagMode
        }
    }

    return { mode, holdMs, markerId }
}
