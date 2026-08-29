import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type PreviewExpandedWorkspaceProps = {
    header: ReactNode
    saveError: string | null
    leftPanelOpen: boolean
    leftPanelWidth: number
    rightPanelOpen: boolean
    rightPanelWidth: number
    isResizingPanels: boolean
    leftSidebar: ReactNode
    previewArea: ReactNode
    rightInspector: ReactNode
}

export function PreviewExpandedWorkspace({
    header,
    saveError,
    leftPanelOpen,
    leftPanelWidth,
    rightPanelOpen,
    rightPanelWidth,
    isResizingPanels,
    leftSidebar,
    previewArea,
    rightInspector
}: PreviewExpandedWorkspaceProps) {
    return (
        <div className="flex min-h-0 flex-1 flex-col bg-sparkle-bg">
            {header}
            {saveError ? <div className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-200">{saveError}</div> : null}

            <div className="flex min-h-0 min-w-0 flex-1">
                <aside
                    className={cn(
                        'relative flex shrink-0 flex-col overflow-hidden border-r bg-sparkle-card will-change-[width,transform] transition-[width,transform,border-color] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                        isResizingPanels ? 'duration-0' : 'duration-[220ms]',
                        leftPanelOpen
                            ? 'translate-x-0 border-[var(--surface-panel-divider)]'
                            : 'pointer-events-none -translate-x-1 border-transparent'
                    )}
                    style={{ width: leftPanelOpen ? `${leftPanelWidth}px` : '0px' }}
                >
                    <div
                        className={cn(
                            'h-full min-h-0 shrink-0 flex flex-col overflow-hidden transition-[opacity,transform] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                            isResizingPanels ? 'duration-0' : 'duration-[160ms]',
                            leftPanelOpen ? 'translate-x-0 opacity-100' : '-translate-x-1 opacity-0'
                        )}
                        style={{ width: `${leftPanelWidth}px` }}
                    >
                        {leftSidebar}
                    </div>
                    <div
                        data-preview-resize-side="left"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize file navigator"
                        tabIndex={0}
                        className={cn(
                            'group absolute right-0 top-0 z-30 h-full w-2 cursor-col-resize bg-transparent transition-colors',
                            leftPanelOpen ? 'hover:bg-white/[0.03]' : 'pointer-events-none'
                        )}
                        title="Resize left panel"
                    >
                        <div
                            data-preview-resize-side="left"
                            className={cn(
                                'pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors duration-150',
                                leftPanelOpen ? 'group-hover:bg-[var(--accent-primary)]/45' : 'opacity-0'
                            )}
                        />
                    </div>
                </aside>

                <div className="flex min-w-0 flex-1 bg-sparkle-bg">
                    <div className="group/preview relative flex min-h-0 min-w-0 flex-1">
                        <div className="h-full w-full">{previewArea}</div>
                    </div>

                    <aside
                        className={cn(
                            'relative flex shrink-0 flex-col overflow-hidden transition-[width,opacity,transform,background-color,border-color] ease-[cubic-bezier(0.16,1,0.3,1)]',
                            isResizingPanels ? 'duration-0' : 'duration-250',
                            rightPanelOpen
                                ? 'translate-x-0 border-l border-white/[0.06] bg-sparkle-card opacity-100'
                                : 'pointer-events-none translate-x-2 border-l border-transparent bg-transparent opacity-0'
                        )}
                        style={{ width: rightPanelOpen ? `${rightPanelWidth}px` : '0px' }}
                    >
                        <div
                            className={cn(
                                'flex h-full min-h-0 flex-col transition-[opacity,transform] ease-[cubic-bezier(0.16,1,0.3,1)]',
                                isResizingPanels ? 'duration-0' : 'duration-250',
                                rightPanelOpen ? 'translate-x-0 opacity-100' : 'translate-x-2 opacity-0'
                            )}
                        >
                            {rightInspector}
                        </div>
                        <div
                            data-preview-resize-side="right"
                            role="separator"
                            aria-orientation="vertical"
                            aria-label="Resize file side panel"
                            tabIndex={0}
                            className={cn(
                                'group absolute left-0 top-0 z-30 h-full w-2 cursor-col-resize bg-transparent transition-colors',
                                rightPanelOpen ? 'hover:bg-white/[0.03]' : 'pointer-events-none'
                            )}
                            title="Resize right panel"
                        >
                            <div
                                data-preview-resize-side="right"
                                className={cn(
                                    'pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors duration-150',
                                    rightPanelOpen ? 'group-hover:bg-[var(--accent-primary)]/45' : 'opacity-0'
                                )}
                            />
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    )
}
