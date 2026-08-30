import { memo, useMemo, useState } from 'react'
import { FileIcon, FolderIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    materialFileIconUrl,
    preloadMaterialFileIcon,
    resolveMaterialFileIconAsset,
    scheduleCommonMaterialFileIconPrewarm
} from './file-preview/materialFileIconTheme'

scheduleCommonMaterialFileIconPrewarm()

export const FileEntryIcon = memo(function FileEntryIcon({
    pathValue,
    kind,
    theme,
    expanded = false,
    root = false,
    size,
    className,
    loading
}: {
    pathValue: string
    kind: 'file' | 'directory'
    theme: 'light' | 'dark'
    expanded?: boolean
    root?: boolean
    size?: number
    className?: string
    loading?: 'eager' | 'lazy'
}) {
    const [failedIconUrl, setFailedIconUrl] = useState<string | null>(null)
    const icon = useMemo(() => resolveMaterialFileIconAsset({
        path: pathValue,
        kind,
        expanded,
        root,
        light: theme === 'light'
    }), [expanded, kind, pathValue, root, theme])
    const iconUrl = materialFileIconUrl(icon.fileName)
    const loadingMode = loading ?? (size && size >= 32 ? 'lazy' : 'eager')
    if (loadingMode === 'eager') void preloadMaterialFileIcon(icon.fileName)
    const style = size ? { width: size, height: size } : undefined

    if (failedIconUrl === iconUrl) {
        const FallbackIcon = kind === 'directory' ? FolderIcon : FileIcon
        return <FallbackIcon className={cn(size ? '' : 'size-4', 'shrink-0 text-sparkle-text-muted', className)} style={style} />
    }

    return (
        <img
            src={iconUrl}
            alt=""
            aria-hidden="true"
            draggable={false}
            loading={loadingMode}
            decoding="async"
            data-material-icon={icon.definition}
            className={cn(size ? '' : 'size-4', 'shrink-0 select-none object-contain', className)}
            style={style}
            onError={() => setFailedIconUrl(iconUrl)}
        />
    )
})
