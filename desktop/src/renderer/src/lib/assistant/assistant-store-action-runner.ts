import type { DevScopeResult } from '@shared/contracts/devscope-api'
import type { AssistantStoreState } from './assistant-store-runtime'

type SetAssistantStoreState = (
    nextState:
        | Partial<AssistantStoreState>
        | ((current: AssistantStoreState) => Partial<AssistantStoreState>)
) => void

export async function runAssistantStoreAction<T = Record<string, unknown>>(
    setState: SetAssistantStoreState,
    work: () => Promise<DevScopeResult<T>>
): Promise<DevScopeResult<T>> {
    setState({ error: null, commandPending: true })
    try {
        const result = await work()
        if (!result.success) {
            setState({ error: result.error })
            return result
        }
        return result
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Assistant command failed.'
        setState({ error: message })
        return { success: false as const, error: message }
    } finally {
        setState({ commandPending: false })
    }
}
