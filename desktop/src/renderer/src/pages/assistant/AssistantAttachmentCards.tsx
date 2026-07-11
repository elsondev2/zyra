import type { ReactNode } from 'react'
import { FileCode2, FileText, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type AssistantAttachmentCardBaseProps = {
    widthClassName: string
    onClick?: () => void
    onRemove?: () => void
    removable?: boolean
    removing?: boolean
    title?: string
    children: ReactNode
}

function AttachmentCardBase({
    widthClassName,
    onClick,
    onRemove,
    removable = false,
    removing = false,
    title,
    children
}: AssistantAttachmentCardBaseProps) {
    const content = onClick ? (
        <button
            type="button"
            onClick={onClick}
            className="relative block h-full w-full text-left"
            disabled={removing}
            title={title}
        >
            {children}
        </button>
    ) : (
        <div className="relative block h-full w-full text-left">
            {children}
        </div>
    )

    return (
        <article
            data-composer-attachment-item="true"
            className={cn(
                'group relative overflow-hidden rounded-lg border border-white/10 bg-sparkle-card/95 shadow-lg shadow-black/20 backdrop-blur-xl transition-colors hover:border-white/20 hover:bg-white/[0.05]',
                widthClassName
            )}
            style={{
                transition: 'transform 190ms ease, opacity 190ms ease, filter 190ms ease',
                transform: removing ? 'translateY(6px) scale(0.82)' : 'translateY(0) scale(1)',
                opacity: removing ? 0 : 1,
                filter: removing ? 'blur(1px)' : 'blur(0)'
            }}
        >
            {content}
            {removable ? (
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation()
                        onRemove?.()
                    }}
                    className="absolute right-1 top-1 shrink-0 rounded-md border border-white/10 bg-black/35 p-1 text-sparkle-text-muted opacity-90 backdrop-blur-sm transition-colors hover:bg-rose-500/10 hover:text-rose-300"
                    disabled={removing}
                    title="Remove attachment"
                >
                    <X size={11} />
                </button>
            ) : null}
        </article>
    )
}

export function AssistantPastedTextCard({
    widthClassName = 'w-[92px]',
    onClick,
    onRemove,
    removable = false,
    removing = false,
    label = 'Pasted Text',
    previewText = null
}: {
    widthClassName?: string
    onClick?: () => void
    onRemove?: () => void
    removable?: boolean
    removing?: boolean
    label?: string
    previewText?: string | null
}) {
    const normalizedPreview = String(previewText || '')
        .replace(/\r/g, '')
        .trim()
    const previewLines = normalizedPreview
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 5)

    return (
        <AttachmentCardBase
            widthClassName={widthClassName}
            onClick={onClick}
            onRemove={onRemove}
            removable={removable}
            removing={removing}
            title="Open pasted text"
        >
            <div className="relative flex h-[96px] w-full flex-col items-center justify-start gap-1.5 p-[6px] text-left">
                <div className="relative flex h-[64px] w-full items-start justify-start overflow-hidden rounded-[10px] border border-white/10 bg-sparkle-card/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    {previewLines.length > 0 ? (
                        <>
                            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.09),transparent_54%)]" />
                            <div className="pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-white/[0.04] to-transparent" />
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-sparkle-card via-sparkle-card/88 to-transparent" />
                            <div className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-sparkle-card/72 to-transparent" />
                            <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-sparkle-card via-sparkle-card/84 to-transparent" />
                            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_0%,transparent_46%,rgba(0,0,0,0.05)_100%)]" />
                            <div className="relative z-10 h-full w-full px-2 pb-2 pt-1.5">
                                <div className="space-y-[2px] overflow-hidden">
                                    {previewLines.map((line, index) => (
                                        <p key={`${index}-${line}`} className="line-clamp-2 whitespace-pre-wrap break-words font-mono text-[7px] leading-[1.08] text-sparkle-text-secondary/78">
                                            {line}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-white/8 to-transparent" />
                            <FileText size={28} className="relative z-10 m-auto text-sparkle-text-secondary" />
                        </>
                    )}
                </div>
                <span className="block w-full text-center text-[10px] font-semibold uppercase leading-none tracking-[0.08em] text-sparkle-text-secondary">
                    {label}
                </span>
            </div>
        </AttachmentCardBase>
    )
}

export function AssistantFileAttachmentCard({
    name,
    contentType,
    category,
    widthClassName = 'w-[116px]',
    pathLabel,
    onClick,
    onRemove,
    removable = false,
    removing = false,
    previewText
}: {
    name: string
    contentType: string
    category: 'image' | 'code' | 'doc'
    widthClassName?: string
    pathLabel?: string | null
    onClick?: () => void
    onRemove?: () => void
    removable?: boolean
    removing?: boolean
    previewText?: string | null
}) {
    return (
        <AttachmentCardBase
            widthClassName={widthClassName}
            onClick={onClick}
            onRemove={onRemove}
            removable={removable}
            removing={removing}
            title={onClick ? 'Open preview' : undefined}
        >
            <div className="flex items-start gap-2 p-2">
                <div className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md border', category === 'code' ? 'border-indigo-400/30 bg-indigo-500/10 text-indigo-300' : 'border-white/10 bg-sparkle-bg text-sparkle-text-secondary')}>
                    {category === 'code' ? <FileCode2 size={13} /> : <FileText size={13} />}
                </div>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[9px] font-medium text-sparkle-text">{name}</span>
                    <span className="block truncate font-mono text-[7px] uppercase tracking-[0.1em] text-sparkle-text-muted">{contentType}</span>
                </span>
            </div>
            {previewText ? (
                <div className="px-2 pb-1 pt-0">
                    <p className="line-clamp-2 text-[8px] leading-3 text-sparkle-text-muted">{previewText}</p>
                </div>
            ) : pathLabel ? (
                <div className="px-2 pb-1.5 pt-0">
                    <div className="truncate font-mono text-[8px] text-sparkle-text-muted/80">{pathLabel}</div>
                </div>
            ) : null}
        </AttachmentCardBase>
    )
}
