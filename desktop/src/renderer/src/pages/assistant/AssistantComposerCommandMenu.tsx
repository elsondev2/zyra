import { useEffect, useRef } from 'react'
import { Braces, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AssistantComposerCommandItem } from './assistant-composer-command-menu'
import {
    formatAssistantPromptResourceScope,
    getAssistantComposerCommandOptionId
} from './assistant-composer-command-menu'

export function AssistantComposerCommandMenu({
    menuId,
    items,
    activeIndex,
    loading,
    error,
    onActiveIndexChange,
    onSelect
}: {
    menuId: string
    items: AssistantComposerCommandItem[]
    activeIndex: number
    loading: boolean
    error: string | null
    onActiveIndexChange: (index: number) => void
    onSelect: (item: AssistantComposerCommandItem) => void
}) {
    const listRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        const activeItem = listRef.current?.querySelector<HTMLElement>('[data-command-active="true"]')
        activeItem?.scrollIntoView({ block: 'nearest' })
    }, [activeIndex])

    return (
        <div className="pointer-events-auto mx-auto w-[calc(100%-1rem)] overflow-hidden rounded-t-[18px] rounded-b-[4px] border border-b-0 border-white/[0.075] bg-[color-mix(in_srgb,var(--color-card)_97%,transparent)] shadow-[0_-18px_42px_rgba(0,0,0,0.24)] backdrop-blur-xl sm:w-[calc(100%-2.25rem)]">
            <div
                id={menuId}
                ref={listRef}
                className="custom-scrollbar max-h-[min(19rem,42vh)] overflow-y-auto px-1.5 pb-3 pt-1.5"
                role="listbox"
                aria-label="Commands and skills"
            >
                {loading && items.length === 0 ? (
                    <div className="flex h-14 items-center px-3 text-[12px] text-sparkle-text-muted/70">
                        Loading commands and skills…
                    </div>
                ) : error && items.length === 0 ? (
                    <div className="flex min-h-14 items-center px-3 text-[12px] text-rose-200/75">{error}</div>
                ) : items.length === 0 ? (
                    <div className="flex min-h-14 items-center px-3 text-[12px] text-sparkle-text-muted/70">
                        No matching commands or skills
                    </div>
                ) : items.map((item, index) => {
                    const active = index === activeIndex
                    const ResourceIcon = item.kind === 'skill' ? Sparkles : Braces
                    return (
                        <button
                            id={getAssistantComposerCommandOptionId(menuId, item.id)}
                            key={item.id}
                            type="button"
                            role="option"
                            aria-selected={active}
                            data-command-active={active ? 'true' : 'false'}
                            onMouseEnter={() => onActiveIndexChange(index)}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => onSelect(item)}
                            className={cn(
                                'flex w-full items-center gap-3 rounded-[11px] px-3 py-2 text-left transition-[background-color,color] duration-150',
                                active ? 'bg-white/[0.075] text-sparkle-text' : 'text-sparkle-text-secondary hover:bg-white/[0.045]'
                            )}
                        >
                            <ResourceIcon
                                size={14}
                                strokeWidth={1.8}
                                className={cn('shrink-0', item.kind === 'skill' ? 'text-[var(--accent-primary)]' : 'text-white/38')}
                            />
                            <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-baseline gap-2">
                                    <span className="shrink-0 font-mono text-[12px] font-medium text-sparkle-text">{item.label}</span>
                                    <span className="min-w-0 truncate text-[11.5px] text-sparkle-text-muted/75">{item.description}</span>
                                </div>
                            </div>
                            <span className="shrink-0 rounded-md bg-white/[0.045] px-1.5 py-0.5 text-[9px] font-medium text-white/38">
                                {formatAssistantPromptResourceScope(item.scope)}
                            </span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
