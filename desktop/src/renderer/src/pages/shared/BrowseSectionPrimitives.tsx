import type { ComponentType, ElementType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const WRAP_AND_CLAMP_2 = 'whitespace-normal break-words [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden'

interface SectionHeaderProps {
    icon: ComponentType<{ size?: number | string; className?: string }>
    iconClassName: string
    title: string
    count: number
}

export function SectionHeader({ icon: Icon, iconClassName, title, count }: SectionHeaderProps) {
    return (
        <div className="mb-6 flex items-center gap-3">
            <Icon size={18} className={iconClassName} />
            <h2 className="text-sm font-medium text-white/60">{title}</h2>
            <span className="text-xs text-white/30">{count}</span>
            <div className="h-px flex-1 bg-white/5" />
        </div>
    )
}

interface FinderItemProps {
    icon: ElementType<{ size?: number | string; className?: string }>
    title: string
    subtitle?: string
    tag?: string
    tagColor?: string
    onClick: () => void
    className?: string
    iconClassName?: string
    visual?: ReactNode
}

export function FinderItem({ icon: Icon, title, subtitle, tag, tagColor, onClick, className, iconClassName, visual }: FinderItemProps) {
    return (
        <button
            onClick={onClick}
            title={subtitle ? `${title} - ${subtitle}` : title}
            className={cn(
                'group flex w-full max-w-[120px] flex-col items-center gap-2 rounded-xl p-3 transition-colors duration-150',
                'hover:bg-sparkle-card/80',
                className
            )}
        >
            <div className="relative flex h-16 w-16 items-center justify-center overflow-visible rounded-2xl border border-white/5 bg-sparkle-bg shadow-inner transition-colors group-hover:border-white/14">
                {visual || <Icon size={32} className={cn('transition-colors duration-150', iconClassName)} />}

                {tag && (
                    <div
                        className="absolute -bottom-1 -right-1 z-10 rounded-md border border-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-lg"
                        style={{ backgroundColor: tagColor || '#6b7280' }}
                    >
                        {tag}
                    </div>
                )}
            </div>
            <div className="flex w-full flex-col items-center gap-0.5 px-1 text-center">
                <span className={cn('min-h-8 w-full text-xs font-medium leading-4 text-white/80 transition-colors group-hover:text-white', WRAP_AND_CLAMP_2)}>
                    {title}
                </span>
                {subtitle && (
                    <span className="w-full truncate text-[10px] text-white/30 transition-colors group-hover:text-white/50">
                        {subtitle}
                    </span>
                )}
            </div>
        </button>
    )
}
