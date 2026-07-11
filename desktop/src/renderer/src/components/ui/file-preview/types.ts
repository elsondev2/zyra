export type PreviewMediaType = 'image' | 'video' | 'audio'
export type PreviewFileType = 'md' | 'html' | PreviewMediaType | 'text' | 'code' | 'json' | 'csv'

export interface PreviewFile {
    name: string
    path: string
    type: PreviewFileType
    language?: string
    startInEditMode?: boolean
    focusLine?: number | null
    focusLineRequestId?: number | null
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
}

export interface PreviewMeta {
    truncated?: boolean
    size?: number | null
    previewBytes?: number | null
    modifiedAt?: number | null
}
