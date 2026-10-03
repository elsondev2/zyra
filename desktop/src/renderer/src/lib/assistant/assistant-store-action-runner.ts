import type { DevScopeResult } from '@shared/contracts/devscope-api'
import type { AssistantStoreState } from './assistant-store-runtime'

type SetAssistantStoreState = (
    nextState:
        | Partial<AssistantStoreState>
        | ((current: AssistantStoreState) => Partial<AssistantStoreState>)
) => void

export async function runAssistantStoreAction<T = Record<string, unknown>>(
    setState: SetAssistantStoreState,
    work: () => Promise<DevScopeResult<T>>,
    options: { markCommandPending?: boolean; reportError?: boolean } = {}
): Promise<DevScopeResult<T>> {
    const { markCommandPending = true, reportError = true } = options
    setState(markCommandPending ? { error: null, commandPending: true } : { error: null })
    try {
        const result = await work()
        if (!result.success) {
            if (reportError) setState({ error: result.error })
            return result
        }
        return result
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Assistant command failed.'
        if (reportError) setState({ error: message })
        return { success: false as const, error: message }
    } finally {
        if (markCommandPending) setState({ commandPending: false })
    }
}
