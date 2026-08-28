import { memo } from 'react'
import { FileEntryIcon } from '@/components/ui/FileEntryIcon'

export const FileSystemEntryIcon = memo(function FileSystemEntryIcon({
    path,
    kind,
    expanded = false,
    root = false,
    light = false,
    size = 16,
    className
}: {
    path: string
    kind: 'file' | 'directory'
    expanded?: boolean
    root?: boolean
    light?: boolean
    size?: number
    className?: string
}) {
    return (
        <FileEntryIcon
            pathValue={path}
            kind={kind}
            expanded={expanded}
            root={root}
            theme={light ? 'light' : 'dark'}
            size={size}
            className={className}
        />
    )
})
