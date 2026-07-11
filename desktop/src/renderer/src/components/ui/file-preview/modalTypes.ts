import type { PreviewFile, PreviewMediaItem, PreviewMeta, PreviewOpenOptions, PreviewTab } from './types'

export interface FilePreviewModalProps extends PreviewMeta {
    file: PreviewFile
    previewTabs?: PreviewTab[]
    activePreviewTabId?: string | null
    content: string
    loading?: boolean
    projectPath?: string
    shellMode?: 'modal' | 'window'
    disableFullscreen?: boolean
    onOpenLinkedPreview?: (file: { name: string; path: string }, ext: string, options?: PreviewOpenOptions) => Promise<void>
    onOpenLinkedPreviewInNewTab?: (file: { name: string; path: string }, ext: string, options?: PreviewOpenOptions) => Promise<void>
    onSelectPreviewTab?: (tabId: string) => void
    onClosePreviewTab?: (tabId: string) => void
    onReorderPreviewTabs?: (activeTabId: string, overTabId: string | null) => void
    mediaItems?: PreviewMediaItem[]
    onSaved?: (filePath: string) => Promise<void> | void
    onClose: () => void
}
