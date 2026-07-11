import { Search, SquarePen } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCommandPalette } from '@/lib/commandPalette'
import { cn } from '@/lib/utils'
import type { AssistantRailMode } from './useAssistantPageSidebarState'

function RailActionButton(props: {
    icon: ReactNode
    label: string
    detail?: string
    disabled?: boolean
    onClick: () => void
}) {
    const { icon, label, detail, disabled = false, onClick } = props

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
                'group flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] leading-none transition-colors',
                disabled
                    ? 'cursor-not-allowed text-sparkle-text-muted/35'
                    : 'text-sparkle-text-secondary hover:bg-white/[0.035] hover:text-sparkle-text'
            )}
        >
            <span
                className={cn(
                    'inline-flex h-4 w-4 shrink-0 items-center justify-center text-sparkle-text-muted/80',
                    disabled && 'text-sparkle-text-muted/35'
                )}
            >
                {icon}
            </span>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {detail ? <span className="shrink-0 text-[10px] text-sparkle-text-muted/45">{detail}</span> : null}
        </button>
    )
}

export function AssistantSessionsRailHeaderControls(props: {
    railMode: AssistantRailMode
    commandPending: boolean
    playgroundRootMissing: boolean
    onRailModeChange: (mode: AssistantRailMode) => void
    onChooseProjectPath: () => void
    onOpenLabDialog: (source?: 'empty' | 'git-clone' | 'existing-folder') => void
    onChoosePlaygroundRoot: () => void
    onCreatePlaygroundSession: (labId?: string | null) => void
}) {
    const { commandPending, onCreatePlaygroundSession } = props
    const { open } = useCommandPalette()

    return (
        <header className="shrink-0 pb-2">
            <div className="space-y-0.5">
                <RailActionButton
                    icon={<SquarePen size={18} strokeWidth={1.75} />}
                    label="New chat"
                    disabled={commandPending}
                    onClick={() => onCreatePlaygroundSession(null)}
                />
                <RailActionButton
                    icon={<Search size={18} strokeWidth={1.75} />}
                    label="Search"
                    detail="Ctrl K"
                    onClick={open}
                />
            </div>
        </header>
    )
}
