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
        <div className="flex min-h-0 flex-1 bg-sparkle-bg">
            <aside
                className={cn(
                    'relative flex shrink-0 flex-col overflow-hidden transition-[width,opacity,transform,padding,border-color] ease-out',
                    isResizingPanels ? 'duration-0' : 'duration-250',
                    leftPanelOpen
                        ? 'translate-x-0 border-r border-white/[0.06] bg-sparkle-card p-0 opacity-100'
                        : 'pointer-events-none -translate-x-2 border-r border-transparent bg-transparent p-0 opacity-0'
                )}
                style={{ width: leftPanelOpen ? `${leftPanelWidth}px` : '0px' }}
            >
                {leftSidebar}
                <div
                    data-preview-resize-side="left"
                    className={cn(
                        'group absolute -right-1 top-0 z-30 h-full w-3 cursor-col-resize bg-transparent transition-colors',
                        leftPanelOpen ? 'hover:bg-white/[0.03]' : 'pointer-events-none'
                    )}
                    title="Resize left panel"
                >
                    <div
                        data-preview-resize-side="left"
                        className={cn(
                            'pointer-events-none absolute left-1/2 top-1/2 h-16 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-200',
                            leftPanelOpen
                                ? 'bg-white/[0.14] opacity-70 group-hover:h-24 group-hover:bg-white/[0.32] group-hover:opacity-100'
                                : 'opacity-0'
                        )}
                    />
                </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col bg-sparkle-bg">
                {header}
                {saveError ? <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-200">{saveError}</div> : null}

                <div className="flex min-h-0 min-w-0 flex-1">
                    <div className="group/preview relative flex min-h-0 min-w-0 flex-1">
                        <div className="h-full w-full">
                            {previewArea}
                        </div>
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
                                'flex h-full min-h-0 flex-col gap-3 p-3 transition-[opacity,transform] ease-[cubic-bezier(0.16,1,0.3,1)]',
                                isResizingPanels ? 'duration-0' : 'duration-250',
                                rightPanelOpen ? 'translate-x-0 opacity-100' : 'translate-x-2 opacity-0'
                            )}
                        >
                            {rightInspector}
                        </div>
                        <div
                            data-preview-resize-side="right"
                            className={cn(
                                'group absolute -left-1 top-0 z-30 h-full w-3 cursor-col-resize bg-transparent transition-colors',
                                rightPanelOpen ? 'hover:bg-white/[0.03]' : 'pointer-events-none'
                            )}
                            title="Resize right panel"
                        >
                            <div
                                data-preview-resize-side="right"
                                className={cn(
                                    'pointer-events-none absolute left-1/2 top-1/2 h-16 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-200',
                                    rightPanelOpen
                                        ? 'bg-white/[0.14] opacity-70 group-hover:h-24 group-hover:bg-white/[0.32] group-hover:opacity-100'
                                        : 'opacity-0'
                                )}
                            />
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    )
}
