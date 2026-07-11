import { memo, useMemo, useState } from 'react'
import { FileIcon, FolderIcon } from 'lucide-react'
import { getVscodeIconUrlForEntry } from '@/lib/vscode-icons'
import { cn } from '@/lib/utils'

export const VscodeEntryIcon = memo(function VscodeEntryIcon({
    pathValue,
    kind,
    theme,
    className
}: {
    pathValue: string
    kind: 'file' | 'directory'
    theme: 'light' | 'dark'
    className?: string
}) {
    const [failedIconUrl, setFailedIconUrl] = useState<string | null>(null)
    const iconUrl = useMemo(
        () => getVscodeIconUrlForEntry(pathValue, kind, theme),
        [kind, pathValue, theme]
    )
    const failed = failedIconUrl === iconUrl

    if (failed) {
        return kind === 'directory'
            ? <FolderIcon className={cn('size-4 text-sparkle-text-muted', className)} />
            : <FileIcon className={cn('size-4 text-sparkle-text-muted', className)} />
    }

    return (
        <img
            src={iconUrl}
            alt=""
            aria-hidden="true"
            className={cn('size-4 shrink-0', className)}
            loading="eager"
            decoding="async"
            onError={() => setFailedIconUrl(iconUrl)}
        />
    )
})
