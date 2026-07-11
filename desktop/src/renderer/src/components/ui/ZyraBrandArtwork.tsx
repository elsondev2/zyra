import blueprintUrl from '@/assets/branding/zyra-blueprint.png'
import markUrl from '@/assets/branding/zyra-mark.png'
import { cn } from '@/lib/utils'

type ZyraBrandArtworkProps = {
    className?: string
    alt?: string
    mode?: 'auto' | 'blueprint' | 'mark'
}

export function getZyraBrandArtworkUrl(mode: ZyraBrandArtworkProps['mode'] = 'auto'): string {
    if (mode === 'blueprint') return blueprintUrl
    if (mode === 'mark') return markUrl
    return import.meta.env.DEV ? blueprintUrl : markUrl
}

export function ZyraBrandArtwork({
    className,
    alt = "Zyra artwork",
    mode = 'auto'
}: ZyraBrandArtworkProps) {
    return (
        <img
            src={getZyraBrandArtworkUrl(mode)}
            alt={alt}
            className={cn('block select-none object-contain', className)}
            draggable={false}
        />
    )
}
