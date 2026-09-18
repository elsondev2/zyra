import type { AssistantComposerSessionState } from './assistant-composer-session-state'

type ConfigurationKey = 'model' | 'runtimeMode' | 'interactionMode' | 'effort' | 'fastModeEnabled'
export type AssistantComposerCanonicalConfiguration = Pick<AssistantComposerSessionState, ConfigurationKey>
const configurationKeys: ConfigurationKey[] = ['model', 'runtimeMode', 'interactionMode', 'effort', 'fastModeEnabled']

/** Stored composer state also contains last-used values, so its presence is not a lock.
 * Preserve unsent choices while the server value is unchanged; a new canonical value
 * takes precedence. Missing fields are not resets, and switching chats starts a new baseline.
 */
export function reconcileAssistantComposerCanonicalConfiguration(
    previous: AssistantComposerCanonicalConfiguration | undefined,
    incoming: AssistantComposerCanonicalConfiguration,
    stored: AssistantComposerSessionState,
    pending: AssistantComposerCanonicalConfiguration = {}
): AssistantComposerCanonicalConfiguration {
    const patch: AssistantComposerCanonicalConfiguration = {}
    for (const key of configurationKeys) {
        const value = incoming[key]
        if (key === 'effort' && pending.model !== undefined && pending.model !== incoming.model) continue
        if (value === undefined || (pending[key] !== undefined && pending[key] !== value)) continue
        if (previous ? previous[key] === value : stored[key] !== undefined) continue
        Object.assign(patch, { [key]: value })
    }
    return patch
}

export function retainAssistantComposerCanonicalConfiguration(
    previous: AssistantComposerCanonicalConfiguration | undefined,
    incoming: AssistantComposerCanonicalConfiguration
): AssistantComposerCanonicalConfiguration {
    const next = { ...previous }
    for (const key of configurationKeys) {
        if (incoming[key] !== undefined) Object.assign(next, { [key]: incoming[key] })
    }
    return next
}
