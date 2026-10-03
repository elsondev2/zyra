import { effectiveBindings, shortcutLabel, type CommandId, type ShortcutOverrides, type ShortcutPlatform } from '@shared/keybindings'

export function ShortcutKeycaps({ id, platform, overrides }: { id: CommandId; platform: ShortcutPlatform; overrides: ShortcutOverrides }) {
    const bindings = effectiveBindings(id, platform, overrides)
    if (!bindings.length) return <span className="text-xs text-[var(--settings-text-faint)]">Unassigned</span>
    return <span className="inline-flex flex-wrap items-center justify-end gap-1">{bindings.map(binding => <kbd key={binding} className="rounded border border-[var(--settings-border)] bg-[var(--settings-control)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--settings-text-secondary)]">{shortcutLabel(id, platform, { [id]: [binding] })}</kbd>)}</span>
}
