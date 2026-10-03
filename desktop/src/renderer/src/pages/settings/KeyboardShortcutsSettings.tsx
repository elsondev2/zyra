import { useEffect, useRef, useState } from 'react'
import { AppWindow, Check, CornerUpLeft, Eraser, FileText, Globe2, Keyboard, MessageSquare, PanelsTopLeft, Pencil, RotateCcw, Search, TerminalSquare, X } from 'lucide-react'
import { COMMANDS, bindingConflicts, effectiveBindings, inputBinding, shortcutLabel, type CommandId, type ShortcutOverrides } from '@shared/keybindings'
import { useSettings } from '@/lib/settings'
import { keyboardInput, setShortcutRecording, shortcutPlatform } from '@/lib/keybindings'
import { addOverlayEventListener } from '@/components/ui/native-overlay-portal'
import { SettingsButton, SettingsInput, SettingsNotice, SettingsPageContainer, SettingsRow, SettingsSection } from './settings-layout'
import { ShortcutKeycaps } from './ShortcutKeycaps'
import { shortcutMatchesSearch } from './keyboard-shortcut-search'

const groups = [
    { label: 'Application', key: 'app', scopes: ['app', 'shell'], Icon: AppWindow },
    { label: 'Chats', key: 'chats', scopes: [], Icon: MessageSquare },
    { label: 'Panels', key: 'panels', scopes: [], Icon: PanelsTopLeft },
    { label: 'Files', key: 'files', scopes: [], Icon: FileText },
    { label: 'Navigation', key: 'navigation', scopes: ['navigation'], Icon: CornerUpLeft },
    { label: 'Browser', key: 'browser', scopes: ['browser'], Icon: Globe2 },
    { label: 'Terminal', key: 'terminal', scopes: ['terminal'], Icon: TerminalSquare }
]

export default function KeyboardShortcutsSettings() {
    const { settings, updateSettings, preferencesHydrated, preferencesError } = useSettings()
    const [query, setQuery] = useState('')
    const [keySearch, setKeySearch] = useState(false)
    const [pressedBinding, setPressedBinding] = useState<string | null>(null)
    const searchRoot = useRef<HTMLDivElement | null>(null)
    const focusSearch = () => searchRoot.current?.querySelector('input')?.focus()
    const [recording, setRecording] = useState<CommandId | null>(null)
    const [candidate, setCandidate] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const recordButton = useRef<HTMLButtonElement | null>(null)
    const recorder = useRef<HTMLDivElement | null>(null)
    const mounted = useRef(true)
    const platform = shortcutPlatform()
    const overrides = settings.keyboardShortcuts
    const conflicts = recording && candidate ? bindingConflicts(recording, candidate, platform, overrides) : []
    const stop = () => {
        setRecording(null); setCandidate(null)
        void setShortcutRecording(false).catch(() => undefined)
        recordButton.current?.focus()
    }
    useEffect(() => {
        mounted.current = true
        return () => { mounted.current = false; void setShortcutRecording(false).catch(() => undefined) }
    }, [])
    const save = async (next: ShortcutOverrides) => {
        setBusy(true); setError(null)
        try { await updateSettings({ keyboardShortcuts: next }); if (mounted.current) stop() }
        catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : 'Could not save shortcuts.') }
        finally { if (mounted.current) setBusy(false) }
    }
    useEffect(() => { if (recording) recorder.current?.focus() }, [recording])
    useEffect(() => {
        if (!recording) return
        return addOverlayEventListener('keydown', (event: KeyboardEvent) => {
            // Keep the recorder's Save/Cancel controls keyboard accessible.
            const control = event.composedPath().some(target => typeof (target as Element)?.closest === 'function' && (target as Element).closest('[data-shortcut-recording-control]'))
            if (control && ['Enter', ' '].includes(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) return
            if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) return
            event.preventDefault()
            event.stopImmediatePropagation()
            if (event.key === 'Escape') { if (!busy) stop(); return }
            if (busy || event.repeat || event.isComposing) return
            if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey && candidate && conflicts.length === 0) {
                void save({ ...overrides, [recording]: [candidate] }); return
            }
            const binding = inputBinding(keyboardInput(event))
            if (binding) { setCandidate(binding); setError(null) }
            else if (!['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)) setError('Use Ctrl, Command or Alt with a key, or a function key.')
        }, true)
    }, [recording, candidate, overrides, busy])
    useEffect(() => {
        if (!recording) return
        const onBlur = () => stop()
        window.addEventListener('blur', onBlur)
        return () => window.removeEventListener('blur', onBlur)
    }, [recording])
    const start = async (id: CommandId, button: HTMLButtonElement) => {
        recordButton.current = button
        setError(null); setCandidate(null); setBusy(true)
        try { await setShortcutRecording(true); if (mounted.current) setRecording(id) }
        catch { if (mounted.current) setError('Could not start shortcut recording.') }
        finally { if (mounted.current) setBusy(false) }
    }
    const stopKeySearch = () => {
        setKeySearch(false)
        void setShortcutRecording(false).catch(() => undefined)
    }
    const toggleKeySearch = async () => {
        if (keySearch) { stopKeySearch(); return }
        setBusy(true); setError(null)
        try {
            await setShortcutRecording(true)
            if (mounted.current) { setKeySearch(true); focusSearch() }
            else await setShortcutRecording(false)
        } catch { if (mounted.current) setError('Could not listen for keys.') }
        finally { if (mounted.current) setBusy(false) }
    }
    useEffect(() => {
        if (!keySearch) return
        const remove = addOverlayEventListener('keydown', event => {
            if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) return
            const onButton = event.composedPath().some(target => typeof (target as Element)?.closest === 'function' && (target as Element).closest('[data-shortcut-search-control]'))
            if (onButton && ['Enter', ' '].includes(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) return
            event.preventDefault(); event.stopImmediatePropagation()
            if (event.key === 'Escape') { stopKeySearch(); return }
            const binding = inputBinding(keyboardInput(event))
            if (binding) { setPressedBinding(binding); setQuery(binding); setError(null) }
        }, true)
        const blur = () => stopKeySearch()
        window.addEventListener('blur', blur)
        return () => { remove(); window.removeEventListener('blur', blur) }
    }, [keySearch])
    const visible = COMMANDS.filter(command => (import.meta.env.DEV || command.id !== 'app.loadingPreview') && shortcutMatchesSearch(command, query, platform, overrides, pressedBinding))
    const disabled = busy || !preferencesHydrated || Boolean(preferencesError) || Boolean(recording) || keySearch
    return <SettingsPageContainer title="Keyboard shortcuts">
        <div ref={searchRoot} className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
                <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 text-[var(--settings-text-muted)]" />
                <SettingsInput aria-label="Search keyboard shortcuts" placeholder={keySearch ? 'Press a shortcut…' : 'Search commands or keys'} value={query} readOnly={keySearch} disabled={Boolean(recording)} onChange={event => { setPressedBinding(null); setQuery(event.target.value) }} className="!w-full !pl-8 !pr-9" />
                <SettingsButton variant={keySearch ? 'accent' : 'ghost'} data-shortcut-search-control disabled={busy || Boolean(recording)} aria-pressed={keySearch} aria-label="Search by pressing keys" title={keySearch ? 'Stop listening (Escape)' : 'Search by pressing keys'} onClick={() => void toggleKeySearch()} className="absolute right-0.5 top-1/2 !size-7 -translate-y-1/2 !p-0"><Keyboard size={14} /></SettingsButton>
            </div>
            {query && <SettingsButton variant="ghost" data-shortcut-search-control disabled={Boolean(recording)} aria-label="Clear shortcut search" title="Clear search" onClick={() => { setQuery(''); setPressedBinding(null); if (keySearch) stopKeySearch(); focusSearch() }}><X size={14} /></SettingsButton>}
            <SettingsButton variant="ghost" className="!size-8 !p-0" disabled={disabled || Object.keys(overrides).length === 0} title="Reset all shortcuts" aria-label="Reset all shortcuts" onClick={() => { if (window.confirm('Reset all keyboard shortcuts to defaults?')) void save({}) }}><RotateCcw size={14} /></SettingsButton>
        </div>
        {(error || preferencesError) && <SettingsNotice tone="error">{error || preferencesError}</SettingsNotice>}
        {!preferencesHydrated && <SettingsNotice>Loading shortcuts…</SettingsNotice>}
        {visible.length === 0 && <SettingsNotice>No matching shortcuts.</SettingsNotice>}
        {groups.map(({ label, key, scopes, Icon }) => {
            const commands = visible.filter(command => ('group' in command ? command.group === key : scopes.includes(command.scope)))
            if (!commands.length) return null
            return <SettingsSection key={label} title={label} icon={<Icon size={15} />}>
                {commands.map(command => {
                    const bindings = effectiveBindings(command.id, platform, overrides)
                    const modified = Object.prototype.hasOwnProperty.call(overrides, command.id)
                    const conflicting = bindings.some(binding => bindingConflicts(command.id, binding, platform, overrides).length > 0)
                    const editing = recording === command.id
                    return <SettingsRow key={command.id} title={command.label} description={null} className="!py-2.5 [&_p:empty]:hidden"
                        info={`Default: ${shortcutLabel(command.id, platform, {}) || 'Unassigned'}. ${command.scope === 'terminal' ? 'While the terminal is focused.' : command.scope === 'browser' ? 'In Browser.' : 'Editor and terminal input stays with its surface.'}`}
                        status={conflicting ? 'Conflict' : modified ? 'Custom' : null} statusTone={conflicting ? 'warning' : 'muted'}
                        control={<><ShortcutKeycaps id={command.id} platform={platform} overrides={overrides} />
                            <SettingsButton variant="ghost" className="!size-7 !p-0" disabled={disabled} aria-label={`Edit ${command.label}`} title={`Edit ${command.label}`} onClick={event => void start(command.id, event.currentTarget)}><Pencil size={13} /></SettingsButton>
                            <SettingsButton variant="ghost" className="!size-7 !p-0" disabled={disabled || !bindings.length} aria-label={`Clear ${command.label}`} title="Clear shortcut" onClick={() => void save({ ...overrides, [command.id]: [] })}><Eraser size={13} /></SettingsButton>
                            <SettingsButton variant="ghost" className="!size-7 !p-0" disabled={disabled || !modified} aria-label={`Reset ${command.label}`} title="Reset to default" onClick={() => { const next = { ...overrides }; delete next[command.id]; void save(next) }}><RotateCcw size={13} /></SettingsButton>
                        </>}>
                        {editing && <div ref={recorder} tabIndex={-1} data-keybinding-recording className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-[var(--settings-border)] bg-[var(--settings-control)] p-2" role="group" aria-label={`Record ${command.label}`}>
                            <Keyboard size={14} className="text-[var(--accent-primary)]" />
                            <span className="min-w-0 flex-1 text-xs" aria-live="polite">{candidate ? <ShortcutKeycaps id={command.id} platform={platform} overrides={{ [command.id]: [candidate] }} /> : 'Press keys…'}<span className="ml-2 text-[var(--settings-text-muted)]">Esc to cancel</span></span>
                            <SettingsButton variant="accent" className="!size-7 !p-0" disabled={!candidate || conflicts.length > 0 || busy} data-shortcut-recording-control aria-label="Save shortcut" title="Save shortcut (Enter)" onClick={() => { if (candidate) void save({ ...overrides, [command.id]: [candidate] }) }}><Check size={14} /></SettingsButton>
                            <SettingsButton variant="ghost" className="!size-7 !p-0" disabled={busy} data-shortcut-recording-control aria-label="Cancel recording" title="Cancel recording (Escape)" onClick={stop}><X size={14} /></SettingsButton>
                            {conflicts.length > 0 && <p role="alert" className="w-full text-xs text-[var(--status-warning)]">Used by {conflicts.map(id => COMMANDS.find(command => command.id === id)?.label).join(', ')}. Choose another shortcut or clear that binding first.</p>}
                        </div>}
                    </SettingsRow>
                })}
            </SettingsSection>
        })}
    </SettingsPageContainer>
}
