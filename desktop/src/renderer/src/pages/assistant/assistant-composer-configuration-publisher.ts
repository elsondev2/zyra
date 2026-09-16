import type { AssistantUpdateSessionConfigurationInput } from '@shared/assistant/contracts'

type Patch = Pick<AssistantUpdateSessionConfigurationInput, 'model' | 'runtimeMode' | 'effort'>
type Publisher = ((input: AssistantUpdateSessionConfigurationInput) => Promise<void>) & {
    pending: (sessionId: string, threadId: string) => Patch
}
const fields = ['model', 'runtimeMode', 'effort'] as const

/** Preserve edit order and expose only unacknowledged fields for optimistic reconciliation. */
export function createAssistantComposerConfigurationPublisher(
    transport: (input: AssistantUpdateSessionConfigurationInput) => Promise<{ success: boolean; error?: string }>
): Publisher {
    let tail = Promise.resolve()
    let revision = 0
    const pending = new Map<string, Map<string, { revision: number; value: unknown }>>()
    const keyFor = (sessionId: string, threadId: string) => JSON.stringify([sessionId, threadId])
    const publish = (input: AssistantUpdateSessionConfigurationInput): Promise<void> => {
        const key = keyFor(input.sessionId, input.threadId)
        const id = ++revision
        const values = pending.get(key) || new Map()
        for (const field of fields) if (input[field] !== undefined) values.set(field, { revision: id, value: input[field] })
        pending.set(key, values)
        const next = tail.catch(() => undefined).then(async () => {
            try {
                const result = await transport(input)
                if (!result.success) throw new Error(result.error || 'Could not update this chat. Please try again.')
            } finally {
                const current = pending.get(key)
                for (const field of fields) if (current?.get(field)?.revision === id) current.delete(field)
                if (!current?.size) pending.delete(key)
            }
        })
        tail = next
        return next
    }
    return Object.assign(publish, {
        pending: (sessionId: string, threadId: string): Patch => {
            const patch: Patch = {}
            for (const [field, entry] of pending.get(keyFor(sessionId, threadId)) || []) Object.assign(patch, { [field]: entry.value })
            return patch
        }
    })
}
