import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type AssistantAttachmentImageCardProps = {
    name: string
    src: string
    widthClassName: string
    heightClassName: string
    onClick?: () => void
    onRemove?: () => void
    removable?: boolean
    removing?: boolean
}

export function AssistantAttachmentImageCard({
    name,
    src,
    widthClassName,
    heightClassName,
    onClick,
    onRemove,
    removable = false,
    removing = false
}: AssistantAttachmentImageCardProps) {
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
            {onClick ? (
                <button
                    type="button"
                    onClick={onClick}
                    className="relative block w-full cursor-pointer text-left"
                    title="Open file preview"
                    aria-label={`Open preview for ${name}`}
                >
                    <div className="p-[3px]">
                        <div className={cn('overflow-hidden rounded-[10px] border border-white/[0.08] bg-black/20 p-0.5')}>
                            <img
                                src={src}
                                alt={name}
                                className={cn('w-full rounded-[8px] object-cover', heightClassName)}
                                loading="lazy"
                            />
                        </div>
                    </div>
                </button>
            ) : (
                <div className="relative block w-full text-left">
                    <div className="p-[3px]">
                        <div className={cn('overflow-hidden rounded-[10px] border border-white/[0.08] bg-black/20 p-0.5')}>
                            <img
                                src={src}
                                alt={name}
                                className={cn('w-full rounded-[8px] object-cover', heightClassName)}
                                loading="lazy"
                            />
                        </div>
                    </div>
                </div>
            )}
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
