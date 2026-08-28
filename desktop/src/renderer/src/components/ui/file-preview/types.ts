export type PreviewMediaType = 'image' | 'video' | 'audio'
export type PreviewOfficeType = 'docx' | 'xlsx' | 'pptx'
export type PreviewFileType = 'directory' | 'md' | 'html' | 'pdf' | PreviewOfficeType | PreviewMediaType | 'text' | 'code' | 'json' | 'csv'

export interface PreviewFile {
    name: string
    path: string
    type: PreviewFileType
    language?: string
    startInEditMode?: boolean
    focusLine?: number | null
    focusLineRequestId?: number | null
    openNavigator?: boolean
    navigatorRevealRequestId?: string | null
}

export interface PreviewTab {
    id: string
    file: PreviewFile
}

export interface PreviewMediaSource {
    name: string
    path: string
    extension: string
    thumbnailPath?: string | null
}

export interface PreviewMediaItem extends PreviewMediaSource {
    type: PreviewMediaType
}

export interface PreviewOpenOptions {
    startInEditMode?: boolean
    mediaItems?: PreviewMediaSource[]
    focusLine?: number
    targetKind?: 'file' | 'directory'
    openNavigator?: boolean
    revealNavigatorTarget?: boolean
}

export interface PreviewMeta {
    truncated?: boolean
    size?: number | null
    previewBytes?: number | null
    modifiedAt?: number | null
}
