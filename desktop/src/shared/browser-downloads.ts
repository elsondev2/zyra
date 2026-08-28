export const BROWSER_DOWNLOADS_CHANGED_CHANNEL = 'devscope:browserDownloads:changed'
export const BROWSER_DOWNLOADS_LIST_CHANNEL = 'devscope:browserDownloads:list'
export const BROWSER_DOWNLOADS_ACTION_CHANNEL = 'devscope:browserDownloads:action'
export const BROWSER_DOWNLOADS_PREVIEW_CHANNEL = 'devscope:browserDownloads:preview'
export const BROWSER_DOWNLOADS_FOLDER_LIST_CHANNEL = 'devscope:browserDownloads:folder:list'
export const BROWSER_DOWNLOADS_FOLDER_ACTION_CHANNEL = 'devscope:browserDownloads:folder:action'

export type BrowserDownloadStatus =
    | 'progressing'
    | 'paused'
    | 'completed'
    | 'cancelled'
    | 'interrupted'
    | 'blocked'

export type BrowserDownloadRisk = 'normal' | 'archive' | 'dangerous'

export type BrowserDownloadProtectionStatus =
    | 'not-required'
    | 'pending'
    | 'applied'
    | 'failed'

export type BrowserDownloadRecord = {
    id: string
    filename: string
    sourceOrigin: string
    mimeType: string
    status: BrowserDownloadStatus
    receivedBytes: number
    totalBytes: number
    bytesPerSecond: number
    startedAt: string
    updatedAt: string
    completedAt: string | null
    canResume: boolean
    canRetry: boolean
    exists: boolean
    risk: BrowserDownloadRisk
    protectionStatus: BrowserDownloadProtectionStatus
    systemIconDataUrl: string | null
}

export type BrowserDownloadPreviewTarget = {
    name: string
    path: string
    extension: string
}

export type BrowserDownloadAction =
    | { type: 'pause'; id: string }
    | { type: 'resume'; id: string }
    | { type: 'cancel'; id: string }
    | { type: 'retry'; id: string }
    | { type: 'open'; id: string }
    | { type: 'confirm-open'; id: string; token: string }
    | { type: 'reveal'; id: string }
    | { type: 'delete'; id: string }
    | { type: 'clear-history' }
    | { type: 'open-folder' }

export type BrowserDownloadOpenConfirmation = {
    id: string
    token: string
    expiresAt: string
}

export type BrowserDownloadActionResult = {
    downloads: BrowserDownloadRecord[]
    openConfirmation: BrowserDownloadOpenConfirmation | null
}

export type BrowserDownloadsFolderEntry = {
    filename: string
    size: number
    modifiedAt: string
    risk: BrowserDownloadRisk
    systemIconDataUrl: string | null
}

export type BrowserDownloadsFolderAction =
    | { type: 'open'; filename: string }
    | { type: 'confirm-open'; filename: string; token: string }
    | { type: 'reveal'; filename: string }

export type BrowserDownloadsFolderOpenConfirmation = {
    filename: string
    token: string
    expiresAt: string
}

export type BrowserDownloadsFolderActionResult = {
    openConfirmation: BrowserDownloadsFolderOpenConfirmation | null
}
