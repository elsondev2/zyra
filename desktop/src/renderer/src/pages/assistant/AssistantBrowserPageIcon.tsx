import { memo, useEffect, useState } from 'react'
import { Globe2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export const AssistantBrowserPageIcon = memo(function AssistantBrowserPageIcon({
    faviconUrl,
    size = 10,
    className
}: {
    faviconUrl: string | null
    size?: number
    className?: string
}) {
    const [failed, setFailed] = useState(false)

    useEffect(() => {
        setFailed(false)
    }, [faviconUrl])

    if (!faviconUrl || failed) {
        return <Globe2 size={size} className={cn('shrink-0 text-sparkle-text-muted/60', className)} />
    }

    return (
        <img
            src={faviconUrl}
            alt=""
            width={size}
            height={size}
            draggable={false}
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className={cn('shrink-0 object-contain', className)}
        />
    )
})
