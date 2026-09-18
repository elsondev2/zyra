export type SensitiveSettingValueState = {
    value: string
    revealed: boolean
}

export type SensitiveSettingValueAction =
    | { type: 'toggle'; value: string }
    | { type: 'reset'; value: string }

export function maskSensitiveSettingValue(value: string, visiblePrefix = 3): string {
    const characters = Array.from(value)
    const requestedPrefix = Number.isFinite(visiblePrefix) ? Math.floor(visiblePrefix) : 3
    const prefixLength = Math.min(Math.max(requestedPrefix, 0), 4, Math.max(0, characters.length - 1))
    return `${characters.slice(0, prefixLength).join('')}••••••••`
}

export function reduceSensitiveSettingValue(
    state: SensitiveSettingValueState,
    action: SensitiveSettingValueAction
): SensitiveSettingValueState {
    if (action.type === 'reset') return { value: action.value, revealed: false }
    if (action.value !== state.value) return { value: action.value, revealed: true }
    return { ...state, revealed: !state.revealed }
}
