import { useEffect, useMemo, useState } from 'react'
import { getParentFolderPath } from '@/lib/filesystem/fileSystemPaths'
import type { PreviewFile, PreviewMediaItem, PreviewMediaSource } from './types'
import { buildMediaPreviewSources, isMediaPreviewType } from './utils'

type UsePreviewSiblingMediaItemsInput = {
    file: PreviewFile
    projectPath?: string
    mediaItems: PreviewMediaItem[]
}

type FileTreeNode = {
    name: string
    path: string
    type: 'file' | 'directory'
}

function hasCurrentFile(items: PreviewMediaItem[], filePath: string): boolean {
    const targetPath = filePath.toLowerCase()
    return items.some((item) => item.path.toLowerCase() === targetPath)
}

export function usePreviewSiblingMediaItems({
    file,
    projectPath,
    mediaItems
}: UsePreviewSiblingMediaItemsInput): PreviewMediaItem[] {
    const [siblingMediaItems, setSiblingMediaItems] = useState<PreviewMediaItem[]>([])
    const parentFolderPath = useMemo(() => getParentFolderPath(file.path), [file.path])
    const shouldLoadSiblingMedia = (
        isMediaPreviewType(file.type)
        && Boolean(projectPath)
        && Boolean(parentFolderPath)
        && (!hasCurrentFile(mediaItems, file.path) || mediaItems.length <= 1)
    )

    useEffect(() => {
        let cancelled = false
        setSiblingMediaItems([])

        if (!shouldLoadSiblingMedia || !projectPath || !parentFolderPath) return

        void (async () => {
            try {
                const result = await window.devscope.getFileTree(projectPath, {
                    rootPath: parentFolderPath,
                    maxDepth: 0,
                    includeGitStatus: false,
                    includeFileSize: false
                })
                if (cancelled || !result?.success) return

                const sources = (result.tree || [])
                    .filter((node: FileTreeNode) => node.type === 'file')
                    .map((node: FileTreeNode): PreviewMediaSource => ({
                        name: node.name,
                        path: node.path,
                        extension: node.name.includes('.') ? node.name.split('.').pop() || '' : ''
                    }))
                setSiblingMediaItems(buildMediaPreviewSources(sources))
            } catch {
                if (!cancelled) setSiblingMediaItems([])
            }
        })()

        return () => {
            cancelled = true
        }
    }, [parentFolderPath, projectPath, shouldLoadSiblingMedia])

    return useMemo(() => {
        if (hasCurrentFile(mediaItems, file.path) && mediaItems.length > 1) return mediaItems
        if (hasCurrentFile(siblingMediaItems, file.path)) return siblingMediaItems
        return mediaItems
    }, [file.path, mediaItems, siblingMediaItems])
}
