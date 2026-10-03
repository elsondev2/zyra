import { COMMANDS, effectiveBindings, normalizeBinding, shortcutLabel, type ShortcutOverrides, type ShortcutPlatform } from '@shared/keybindings'

function normalizeSearch(value: string): string {
    return value.toLowerCase()
        .replace(/command|cmd|⌘/g, 'meta').replace(/control|ctl|⌃/g, 'ctrl')
        .replace(/option|opt|⌥/g, 'alt').replace(/⇧/g, 'shift')
        .replace(/windows|win|super/g, 'meta').replace(/page[- ]?up/g, 'pageup')
        .replace(/page[- ]?down/g, 'pagedown').replace(/\+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function shortcutMatchesSearch(command: typeof COMMANDS[number], query: string, platform: ShortcutPlatform, overrides: ShortcutOverrides, pressedBinding: string | null = null): boolean {
    // Key search describes what runs now, never a replaced or cleared default.
    if (pressedBinding !== null) {
        const binding = normalizeBinding(pressedBinding, platform)
        return binding !== null && effectiveBindings(command.id, platform, overrides).includes(binding)
    }
    const terms = normalizeSearch(query).split(' ').filter(Boolean)
    const searchable = normalizeSearch([
        command.id, command.label, command.scope,
        shortcutLabel(command.id, platform, overrides), shortcutLabel(command.id, platform, {}),
        ...effectiveBindings(command.id, platform, overrides), ...command.defaults,
        ...('mac' in command ? command.mac || [] : [])
    ].join(' '))
    return terms.every(term => searchable.includes(term))
}
