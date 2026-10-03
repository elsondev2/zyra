import { addOverlayEventListener, createOverlayPortal as createPortal, isOverlayEventInside } from '@/components/ui/native-overlay-portal'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SettingsProviderIcon } from './SettingsProviderIcon'

export type ChatDefaultModelOption = { id: string; label: string; description?: string }
type ProviderGroup = { id: string; label: string; models: ChatDefaultModelOption[] }
type PopoverLayout = { left: number; top: number; width: number; maxHeight: number }
const LONG_CATALOG_THRESHOLD = 8

function providerId(modelId: string) { return modelId.split('/', 1)[0] || 'other' }
function providerLabel(provider: string) {
    if (provider === 'openai-codex') return 'ChatGPT subscription'
    if (provider === 'openai') return 'OpenAI API'
    if (provider === 'opencode') return 'OpenCode Zen'
    if (provider === 'opencode-harness') return 'OpenCode harness'
    if (provider === 'anthropic') return 'Claude API'
    return provider.replace(/[-_]/g, ' ')
}
function providerIcon(provider: string) { return provider === 'openai-codex' ? 'chatgpt' : provider }
function compactModelLabel(model: ChatDefaultModelOption) { return model.label || model.id.split('/').slice(1).join('/') || model.id }

export function ChatDefaultModelPicker({ value, models, onValueChange, ariaLabel = 'Default assistant model', defaultOptionLabel = 'Provider default', disabled = false }: {
    value: string
    models: readonly ChatDefaultModelOption[]
    onValueChange: (value: string) => void | Promise<void>
    ariaLabel?: string
    defaultOptionLabel?: string
    disabled?: boolean
}) {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [expandedProviders, setExpandedProviders] = useState<Set<string>>(() => new Set())
    const [popoverLayout, setPopoverLayout] = useState<PopoverLayout | null>(null)
    const rootRef = useRef<HTMLDivElement | null>(null)
    const popoverRef = useRef<HTMLDivElement | null>(null)
    const inputRef = useRef<HTMLInputElement | null>(null)
    const selected = models.find((model) => model.id === value)
    const selectedProvider = selected ? providerId(selected.id) : null
    const groups = useMemo<ProviderGroup[]>(() => {
        const normalizedQuery = query.trim().toLowerCase()
        const byProvider = new Map<string, ChatDefaultModelOption[]>()
        for (const model of models) {
            const provider = providerId(model.id)
            const searchable = `${model.label} ${model.id} ${providerLabel(provider)}`.toLowerCase()
            if (normalizedQuery && !searchable.includes(normalizedQuery)) continue
            const group = byProvider.get(provider) || []
            group.push(model)
            byProvider.set(provider, group)
        }
        return [...byProvider.entries()].map(([id, providerModels]) => ({ id, label: providerLabel(id), models: providerModels }))
    }, [models, query])

    const positionPopover = useCallback(() => {
        const trigger = rootRef.current
        if (!trigger) return
        const rect = trigger.getBoundingClientRect()
        const padding = 8
        const gap = 6
        const preferredHeight = 384
        const below = window.innerHeight - rect.bottom - gap - padding
        const above = rect.top - gap - padding
        const openAbove = below < 220 && above > below
        const available = openAbove ? above : below
        const maxHeight = Math.min(preferredHeight, Math.max(160, available))
        const width = Math.min(432, window.innerWidth - padding * 2)
        const left = Math.max(padding, Math.min(rect.right - width, window.innerWidth - width - padding))
        const top = openAbove
            ? Math.max(padding, rect.top - gap - maxHeight)
            : Math.min(window.innerHeight - maxHeight - padding, rect.bottom + gap)
        setPopoverLayout({ left, top, width, maxHeight })
    }, [])

    useEffect(() => {
        if (!open) return
        positionPopover()
        const close = () => {
            setOpen(false)
        }
        const onPointerDown = (event: PointerEvent) => {
            if (!isOverlayEventInside(event, rootRef.current) && !isOverlayEventInside(event, popoverRef.current)) close()
        }
        const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
        const updatePosition = () => positionPopover()
        const removePointerListener = addOverlayEventListener('pointerdown', onPointerDown)
        const removeKeyListener = addOverlayEventListener('keydown', onKeyDown)
        window.addEventListener('resize', updatePosition)
        window.addEventListener('scroll', updatePosition, true)
        const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0)
        return () => {
            window.clearTimeout(focusTimer)
            removePointerListener()
            removeKeyListener()
            window.removeEventListener('resize', updatePosition)
            window.removeEventListener('scroll', updatePosition, true)
        }
    }, [open, positionPopover])

    const select = (nextValue: string) => {
        void onValueChange(nextValue)
        setOpen(false)
        setQuery('')
    }
    const toggleProvider = (provider: string) => setExpandedProviders((current) => {
        const next = new Set(current)
        if (next.has(provider)) next.delete(provider)
        else next.add(provider)
        return next
    })
    const selectedText = selected ? compactModelLabel(selected) : defaultOptionLabel
    const selectedProviderLabel = selected ? providerLabel(providerId(selected.id)) : null

    const popover = open && popoverLayout ? <div ref={popoverRef} role="listbox" aria-label={`${ariaLabel} options`} className="fixed z-[3000] overflow-hidden rounded-lg border border-[var(--settings-border-strong)] bg-[var(--settings-popover)] py-1 shadow-[0_16px_40px_color-mix(in_srgb,var(--color-bg)_60%,transparent)]" style={{ left: popoverLayout.left, top: popoverLayout.top, width: popoverLayout.width, maxHeight: popoverLayout.maxHeight }}>
        <div className="flex items-center gap-2 border-b border-[var(--settings-divider)] px-2.5 py-2">
            <Search size={13} className="shrink-0 text-[var(--settings-text-muted)]" />
            <input ref={inputRef} value={query} onChange={(event) => setQuery(event.currentTarget.value)} onKeyDown={(event) => { if (event.key !== 'Enter') return; const first = groups[0]?.models[0]; if (first) select(first.id) }} placeholder="Search models or providers" className="min-w-0 flex-1 bg-transparent text-xs text-[var(--settings-text)] outline-none placeholder:text-[var(--settings-text-faint)]" />
            {query ? <button type="button" aria-label="Clear model search" onClick={() => setQuery('')} className="inline-flex size-5 items-center justify-center rounded text-[var(--settings-text-muted)] hover:bg-[var(--settings-control-hover)] hover:text-[var(--settings-text)]"><X size={12} /></button> : null}
        </div>
        <div className="overflow-y-auto py-1" style={{ maxHeight: popoverLayout.maxHeight - 41 }}>
            <div className="px-1.5 pb-1">
                <div className="px-2 py-1 text-[10px] font-medium text-[var(--settings-text-muted)]">Current</div>
                <button type="button" role="option" aria-selected={!value} onClick={() => select('')} className={cn('flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors', !value ? 'bg-[var(--settings-row-hover)] text-[var(--settings-text)]' : 'text-[var(--settings-text-secondary)] hover:bg-[var(--settings-row-hover)] hover:text-[var(--settings-text)]')}>
                    <span className="size-[14px] shrink-0" /><span className="min-w-0 flex-1 truncate">{defaultOptionLabel}</span>{!value ? <Check size={14} className="shrink-0 text-[var(--accent-primary)]" /> : null}
                </button>
            </div>
            {groups.map((group) => {
                const canCollapse = !query && group.models.length > LONG_CATALOG_THRESHOLD
                const expanded = !canCollapse || expandedProviders.has(group.id) || group.id === selectedProvider
                return <div key={group.id} className="border-t border-[var(--settings-divider)] px-1.5 py-1">
                    <button type="button" onClick={() => canCollapse && toggleProvider(group.id)} disabled={!canCollapse} className={cn('flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] font-medium text-[var(--settings-text-secondary)]', canCollapse && 'hover:bg-[var(--settings-row-hover)] hover:text-[var(--settings-text)]')}>
                        <SettingsProviderIcon provider={providerIcon(group.id)} size={13} /><span className="min-w-0 flex-1 truncate">{group.label}</span><span className="text-[10px] font-normal text-[var(--settings-text-muted)]">{group.models.length}</span>{canCollapse ? <ChevronRight size={12} className={cn('shrink-0 transition-transform', expanded && 'rotate-90')} /> : null}
                    </button>
                    {expanded ? group.models.map((model) => {
                        const active = model.id === value
                        return <button key={model.id} type="button" role="option" aria-selected={active} onClick={() => select(model.id)} className={cn('flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors', active ? 'bg-[var(--settings-row-hover)] text-[var(--settings-text)]' : 'text-[var(--settings-text-secondary)] hover:bg-[var(--settings-row-hover)] hover:text-[var(--settings-text)]')}>
                            <span className="size-[13px] shrink-0" /><span className="min-w-0 flex-1 truncate">{compactModelLabel(model)}</span>{active ? <Check size={14} className="shrink-0 text-[var(--accent-primary)]" /> : null}
                        </button>
                    }) : null}
                </div>
            })}
            {groups.length === 0 ? <div className="px-3 py-4 text-xs text-[var(--settings-text-secondary)]">No models found.</div> : null}
        </div>
    </div> : null

    return <div ref={rootRef} className="w-full sm:w-[17.5rem]">
        <button type="button" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)} className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md border border-[var(--settings-border)] bg-[var(--settings-control)] px-2.5 text-left text-xs text-[var(--settings-text)] outline-none transition-colors hover:border-[var(--settings-border-strong)] hover:bg-[var(--settings-control-hover)] focus:border-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-50">
            {selected ? <SettingsProviderIcon provider={providerIcon(providerId(selected.id))} size={14} /> : null}
            <span className="min-w-0 flex-1 truncate">{selectedText}{selectedProviderLabel ? <span className="text-[var(--settings-text-muted)]"> {'\u00b7'} {selectedProviderLabel}</span> : null}</span>
            <ChevronDown size={13} className="shrink-0 text-[var(--settings-text-muted)]" />
        </button>
        {popover && typeof document !== 'undefined' ? createPortal(popover, document.body) : null}
    </div>
}
