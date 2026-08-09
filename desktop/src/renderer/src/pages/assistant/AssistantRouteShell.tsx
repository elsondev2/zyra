import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { usePublishAssistantTitleBarContent } from '@/lib/assistant/assistant-title-bar'

const skeletonStrong = 'bg-[color-mix(in_srgb,var(--color-text)_13%,transparent)]'
const skeletonMedium = 'bg-[color-mix(in_srgb,var(--color-text)_9%,transparent)]'
const skeletonSoft = 'bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)]'

function RailRow({ active = false, short = false }: { active?: boolean; short?: boolean }) {
    return (
        <div className={cn('flex h-9 items-center gap-2.5 rounded-md px-2.5', active && 'bg-[var(--surface-active)]')}>
            <div className={cn('size-4 shrink-0 rounded-[4px]', active ? skeletonStrong : skeletonMedium)} />
            <div className={cn('h-2.5 rounded-full', short ? 'w-24' : 'w-36', active ? skeletonStrong : skeletonMedium)} />
            <div className={cn('ml-auto h-2 w-6 rounded-full', skeletonSoft)} />
        </div>
    )
}

function RailAction({ width }: { width: 'short' | 'medium' | 'long' }) {
    return (
        <div className="flex h-8 items-center gap-2.5 rounded-md px-2">
            <div className={cn('size-4 shrink-0 rounded-[4px]', skeletonMedium)} />
            <div className={cn(
                'h-2.5 rounded-full',
                skeletonMedium,
                width === 'short' ? 'w-14' : width === 'medium' ? 'w-20' : 'w-24'
            )} />
        </div>
    )
}

export function AssistantRouteShell(props: {
    sidebarCollapsed: boolean
    sidebarWidth: number
    agentInboxEnabled?: boolean
}) {
    const sidebarWidth = props.sidebarCollapsed ? 0 : props.sidebarWidth
    const titleBarContent = useMemo(() => (
        <div className="drag-region flex h-full min-w-0 items-center gap-1.5 px-3" aria-hidden="true">
            <div className={cn('size-3 rounded-[3px]', skeletonMedium)} />
            <div className={cn('h-2.5 w-20 rounded-full', skeletonStrong)} />
            <div className={cn('mx-0.5 h-3 w-px', skeletonSoft)} />
            <div className={cn('h-2.5 w-52 rounded-full', skeletonStrong)} />
            <div className={cn('ml-1 h-4 w-16 rounded-full', skeletonSoft)} />
        </div>
    ), [])
    usePublishAssistantTitleBarContent(titleBarContent)

    return (
        <div
            className="flex h-[calc(100vh-34px)] min-h-[calc(100vh-34px)] overflow-hidden bg-sparkle-bg [--accent-primary:var(--color-primary)] [--accent-secondary:var(--color-secondary)]"
            data-assistant-route-shell="true"
            aria-busy="true"
        >
            <div
                className="relative h-full shrink-0 overflow-hidden"
                style={{ width: sidebarWidth }}
                aria-hidden={props.sidebarCollapsed}
                data-assistant-shell-sidebar="true"
            >
                <aside
                    className={cn(
                        'zyra-sidebar-surface absolute inset-0 flex h-full flex-col overflow-hidden border-r border-[var(--surface-panel-divider)] px-2 py-2.5',
                        props.sidebarCollapsed && 'hidden'
                    )}
                >
                    <div className="shrink-0 space-y-0.5 px-0.5 pb-3">
                        <RailAction width="medium" />
                        <RailAction width="long" />
                        <RailAction width="short" />
                    </div>

                    {props.agentInboxEnabled ? (
                        <>
                            <div className="shrink-0 pb-2">
                                <div className="flex h-8 items-center gap-2 rounded-md px-2">
                                    <div className={cn('size-4 rounded-[4px]', skeletonMedium)} />
                                    <div className={cn('h-2.5 w-24 rounded-full', skeletonMedium)} />
                                    <div className={cn('ml-auto size-2.5 rounded-[3px]', skeletonSoft)} />
                                </div>
                            </div>
                            <div className="min-h-0 flex-1 overflow-hidden pr-0.5">
                                <div className="mb-1 mt-1 flex items-center gap-2 px-2.5">
                                    <div className={cn('h-2 w-11 rounded-full', skeletonMedium)} />
                                    <div className="h-px flex-1 bg-[var(--surface-divider)]" />
                                </div>
                                <RailRow active />
                                <div className="mb-1 mt-3 flex items-center gap-2 px-2.5">
                                    <div className={cn('h-2 w-12 rounded-full', skeletonMedium)} />
                                    <div className="h-px flex-1 bg-[var(--surface-divider)]" />
                                </div>
                                <RailRow />
                                <div className="mb-1 mt-3 flex items-center gap-2 px-2.5">
                                    <div className={cn('h-2 w-12 rounded-full', skeletonMedium)} />
                                    <div className="h-px flex-1 bg-[var(--surface-divider)]" />
                                </div>
                                <RailRow short />
                                <RailRow />
                                <RailRow short />
                                <RailRow />
                                <RailRow short />
                            </div>
                        </>
                    ) : (
                        <div className="min-h-0 flex-1 overflow-hidden pr-0.5">
                            <div className="mb-1 mt-1 flex items-center gap-2 px-2.5">
                                <div className={cn('h-2 w-10 rounded-full', skeletonMedium)} />
                                <div className="h-px flex-1 bg-[var(--surface-divider)]" />
                            </div>
                            <RailRow active />
                            <RailRow />
                            <div className="mb-1 mt-3 flex items-center gap-2 px-2.5">
                                <div className={cn('h-2 w-14 rounded-full', skeletonMedium)} />
                                <div className="h-px flex-1 bg-[var(--surface-divider)]" />
                            </div>
                            <RailRow />
                            <RailRow short />
                        </div>
                    )}

                    <div className="mt-auto shrink-0 border-t border-[var(--surface-divider)] pt-2">
                        <RailAction width="medium" />
                    </div>
                </aside>
            </div>

            <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-sparkle-bg" aria-label="Opening chat workspace">
                <div
                    className="min-h-0 flex-1 overflow-hidden px-4 pb-[176px] pt-7"
                    data-assistant-shell-timeline="true"
                    aria-hidden="true"
                >
                    <div className="mx-auto w-full max-w-[760px]">
                        <div className="flex items-center gap-2">
                            <div className={cn('h-2.5 w-24 rounded-full', skeletonStrong)} />
                            <div className="h-px flex-1 bg-[var(--surface-divider)]" />
                        </div>
                        <div className={cn('mt-7 h-2.5 w-3/5 rounded-full', skeletonMedium)} />
                        <div className={cn('mt-2.5 h-2.5 w-2/5 rounded-full', skeletonSoft)} />

                        <div className="mt-8 flex justify-end">
                            <div className="w-[42%] rounded-[18px] border border-[var(--surface-divider)] bg-[var(--surface-panel)] px-4 py-3">
                                <div className={cn('h-2.5 w-4/5 rounded-full', skeletonMedium)} />
                            </div>
                        </div>

                        <div className="mt-9 flex items-center gap-2">
                            <div className={cn('h-2.5 w-28 rounded-full', skeletonStrong)} />
                            <div className="h-px flex-1 bg-[var(--surface-divider)]" />
                        </div>
                        <div className={cn('mt-7 h-2.5 w-2/3 rounded-full', skeletonMedium)} />
                        <div className={cn('mt-2.5 h-2.5 w-1/2 rounded-full', skeletonSoft)} />
                        <div className={cn('mt-2.5 h-2.5 w-1/3 rounded-full', skeletonSoft)} />
                    </div>
                </div>

                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 px-4 pb-4 pt-10">
                    <div className="mx-auto w-full max-w-[760px]" data-assistant-shell-composer="true">
                        <div className="relative flex h-[136px] flex-col overflow-hidden rounded-[18px] border border-white/[0.09] bg-[color-mix(in_srgb,var(--color-card)_97%,transparent)] shadow-[0_18px_54px_rgba(0,0,0,0.30),0_1px_0_rgba(255,255,255,0.045),inset_0_1px_0_rgba(255,255,255,0.045)]">
                            <div className="flex min-h-0 flex-1 items-start gap-3 px-3.5 pb-2 pt-3">
                                <div className={cn('mt-0.5 size-4 rounded-[4px]', skeletonMedium)} />
                                <div className={cn('mt-1 h-3 w-28 rounded-full', skeletonMedium)} />
                            </div>
                            <div className="flex h-12 shrink-0 items-center justify-between px-3 pb-2">
                                <div className="flex items-center gap-2">
                                    <div className={cn('h-2.5 w-20 rounded-full', skeletonMedium)} />
                                    <div className={cn('h-2.5 w-9 rounded-full', skeletonSoft)} />
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className={cn('size-9 rounded-full', skeletonSoft)} />
                                    <div className={cn('size-9 rounded-full', skeletonMedium)} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            <span className="sr-only">Opening chat workspace</span>
        </div>
    )
}
