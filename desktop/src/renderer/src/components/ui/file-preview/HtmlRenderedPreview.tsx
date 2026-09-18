import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { openDesktopLink } from '@/lib/desktop-links'
import { getNativeOverlayHost } from '../native-overlay-host'
import { getFileUrl } from './utils'
import type { PreviewHtmlLocation } from './types'
import { withHtmlPreviewLocation } from './html-preview-location'
import type { ViewportPreset, ViewportPresetConfig } from './viewport'

export interface HtmlRenderedPreviewProps {
    filePath: string
    fileName: string
    content: string
    viewport: ViewportPreset
    presetConfig: ViewportPresetConfig
    isExpanded?: boolean
    location?: PreviewHtmlLocation
    onInternalLinkClick?: (targetUrl: string) => Promise<boolean | void> | boolean | void
    onLinkNotice?: (message: string, tone: 'info' | 'error') => void
}

function computeContentStamp(content: string): string {
    let hash = 0

    for (let index = 0; index < content.length; index += 1) {
        hash = ((hash * 31) + content.charCodeAt(index)) | 0
    }

    return Math.abs(hash).toString(36)
}

function samePreviewDocument(left: string, right: string): boolean {
    try {
        const leftUrl = new URL(left)
        const rightUrl = new URL(right)
        leftUrl.hash = ''
        rightUrl.hash = ''
        return leftUrl.href === rightUrl.href
    } catch { return false }
}

function buildPreviewUrl(filePath: string, content: string): string {
    const baseUrl = getFileUrl(filePath)
    const separator = baseUrl.includes('?') ? '&' : '?'
    const contentStamp = computeContentStamp(content)

    return `${baseUrl}${separator}devscope-preview=${contentStamp}`
}

export default function HtmlRenderedPreview({
    filePath,
    fileName,
    content,
    viewport,
    presetConfig,
    isExpanded = false,
    location,
    onInternalLinkClick,
    onLinkNotice
}: HtmlRenderedPreviewProps) {
    const previewUrl = useMemo(
        () => withHtmlPreviewLocation(buildPreviewUrl(filePath, content), location),
        [content, filePath, location?.search, location?.hash]
    )
    const viewportWidth = viewport === 'responsive' ? '100%' : `${presetConfig.width}px`
    const [notice, setNotice] = useState<string | null>(null)

    useEffect(() => {
        let active = true
        setNotice(null)
        const report = (message: string) => {
            if (!active) return
            if (onLinkNotice) onLinkNotice(message, 'error')
            else setNotice(message)
        }
        const subscribe = window.devscope?.onNativeOverlayLinkActivated
        if (typeof subscribe !== 'function') return
        const unsubscribe = subscribe((activation) => {
            if (!active || !getNativeOverlayHost().matches(activation.frameName)
                || !samePreviewDocument(activation.sourceUrl, previewUrl)) return
            setNotice(null)
            void (async () => {
                try {
                    const protocol = new URL(activation.targetUrl).protocol
                    if (protocol === 'http:' || protocol === 'https:') {
                        const result = await openDesktopLink(activation.targetUrl)
                        if (!result.success && !result.cancelled) report(result.error || 'Could not open this link.')
                        return
                    }
                    if (protocol !== 'zyra:' && protocol !== 'file:') return
                    if (!onInternalLinkClick) { report('Local links are unavailable in this preview.'); return }
                    const opened = await onInternalLinkClick(activation.targetUrl)
                    if (opened === false) report('Could not open this link.')
                } catch (error) {
                    report(error instanceof Error ? error.message : 'Could not open this link.')
                }
            })()
        })
        return () => {
            active = false
            unsubscribe()
        }
    }, [onInternalLinkClick, onLinkNotice, previewUrl])

    return (
        <div className="relative h-full w-full min-h-0 overflow-hidden bg-sparkle-bg">
            {notice ? <div role="alert" className="absolute bottom-2 left-2 right-2 z-20 rounded-md border border-[var(--surface-divider)] bg-[var(--surface-floating)] px-3 py-2 text-xs text-sparkle-text">{notice}</div> : null}
            <div
                className={cn(
                    'mx-auto h-full overflow-hidden bg-white transition-[width,max-width,border-radius,box-shadow,transform] duration-420 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width,max-width]',
                    isExpanded ? 'rounded-none shadow-none' : 'rounded-lg shadow-2xl'
                )}
                style={{
                    width: viewportWidth,
                    maxWidth: '100%'
                }}
            >
                <iframe
                    key={previewUrl}
                    src={previewUrl}
                    title={`${fileName} preview`}
                    sandbox="allow-scripts allow-same-origin"
                    allow=""
                    referrerPolicy="no-referrer"
                    className="block h-full w-full"
                    style={{
                        minHeight: isExpanded ? '100%' : '400px',
                        background: 'white',
                        border: 'none'
                    }}
                />
            </div>
        </div>
    )
}
