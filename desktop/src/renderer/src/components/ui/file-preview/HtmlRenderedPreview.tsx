import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { getFileUrl } from './utils'
import type { ViewportPreset, ViewportPresetConfig } from './viewport'

interface HtmlRenderedPreviewProps {
    filePath: string
    fileName: string
    content: string
    viewport: ViewportPreset
    presetConfig: ViewportPresetConfig
    isExpanded?: boolean
}

function computeContentStamp(content: string): string {
    let hash = 0

    for (let index = 0; index < content.length; index += 1) {
        hash = ((hash * 31) + content.charCodeAt(index)) | 0
    }

    return Math.abs(hash).toString(36)
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
    isExpanded = false
}: HtmlRenderedPreviewProps) {
    const previewUrl = useMemo(
        () => buildPreviewUrl(filePath, content),
        [content, filePath]
    )
    const viewportWidth = viewport === 'responsive' ? '100%' : `${presetConfig.width}px`

    return (
        <div className="h-full w-full min-h-0 overflow-hidden bg-sparkle-bg">
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
