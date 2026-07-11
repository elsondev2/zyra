import type { AssistantBusyMessageMode } from '@/lib/settings'
import type { AssistantReasoningEffort } from '@shared/assistant/contracts'
import { getContextFileMeta } from './assistant-composer-utils'
import { EFFORT_LABELS } from './assistant-composer-controller-constants'

export function buildAssistantComposerControllerResult<T extends Record<string, unknown>>(input: T & {
    settingsAssistantBusyMessageMode: AssistantBusyMessageMode
    effortOptions: AssistantReasoningEffort[]
}) {
    const { settingsAssistantBusyMessageMode, effortOptions, ...rest } = input
    return {
        ...rest,
        busyMessageMode: settingsAssistantBusyMessageMode,
        EFFORT_OPTIONS: effortOptions,
        EFFORT_LABELS,
        getContextFileMeta
    }
}
