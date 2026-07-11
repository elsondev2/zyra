import type { ReactNode, RefObject } from 'react'
import { cn } from '@/lib/utils'

type PreviewExpandedPreviewAreaProps = {
    previewSurfaceRef: RefObject<HTMLDivElement | null>
    centerHtmlRenderedPreview: boolean
    isCompactHtmlViewport: boolean
    overflowLocked: boolean
    surfaceBackgroundClass: string
    shouldStretchPreviewBody: boolean
    hasBottomPanel: boolean
    mode: 'preview' | 'edit'
    previewContent: ReactNode
    bottomOverlay?: ReactNode
    bottomOverlayPadding?: number
}

export function PreviewExpandedPreviewArea({
    previewSurfaceRef,
    centerHtmlRenderedPreview,
    isCompactHtmlViewport,
    overflowLocked,
    surfaceBackgroundClass,
    shouldStretchPreviewBody,
    hasBottomPanel,
    mode,
    previewContent,
    bottomOverlay,
    bottomOverlayPadding = 0
}: PreviewExpandedPreviewAreaProps) {
    return (
        <div
            ref={previewSurfaceRef}
            className={cn(
                'relative h-full w-full',
                surfaceBackgroundClass
            )}
        >
            <div
                className={cn(
                    'h-full w-full custom-scrollbar flex',
                surfaceBackgroundClass,
                    centerHtmlRenderedPreview ? 'items-center justify-center' : 'items-stretch justify-start',
                    isCompactHtmlViewport ? 'p-2 sm:p-3' : 'p-0',
                    overflowLocked ? 'overflow-hidden' : 'overflow-auto'
                )}
                style={{ overscrollBehavior: 'contain' }}
            >
                <div
                    className={cn('w-full flex flex-col', shouldStretchPreviewBody ? 'h-full min-h-0' : 'min-h-full')}
                    style={{ paddingBottom: bottomOverlay && bottomOverlayPadding > 0 ? `${bottomOverlayPadding}px` : undefined }}
                >
                    <div
                        className={cn(
                            shouldStretchPreviewBody && 'min-h-0',
                            hasBottomPanel ? 'flex-1' : (shouldStretchPreviewBody ? 'h-full' : ''),
                            hasBottomPanel && mode !== 'edit' ? 'overflow-auto custom-scrollbar' : '',
                            centerHtmlRenderedPreview ? 'flex items-center justify-center' : ''
                        )}
                    >
                        {previewContent}
                    </div>
                </div>
            </div>
            {bottomOverlay ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 m-0 flex items-end p-0">
                    <div className="pointer-events-auto m-0 w-full p-0">
                        {bottomOverlay}
                    </div>
                </div>
            ) : null}
        </div>
    )
}
