import type { AssistantPlaygroundState, AssistantSession } from '../../shared/assistant/contracts'
import { sanitizeOptionalPath } from './utils'

export function resolveAssistantSessionRoute(args: {
    projectPath?: string | null
    mode?: AssistantSession['mode']
    playgroundLabId?: string | null
    playground: AssistantPlaygroundState
}): {
    mode: AssistantSession['mode']
    projectPath: string | null
    playgroundLabId: string | null
} {
    void args.mode
    void args.playgroundLabId
    void args.playground
    return {
        mode: 'work',
        projectPath: sanitizeOptionalPath(args.projectPath),
        playgroundLabId: null
    }
}
