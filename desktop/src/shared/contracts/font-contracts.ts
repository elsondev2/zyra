type DevScopeFontResult<T> = ({ success: true } & T) | { success: false; error: string }

export type DevScopeManagedFontSource = 'google' | 'imported'

export type DevScopeManagedFontFace = {
    fileName: string
    weight: string
    style: 'normal' | 'italic'
    format: 'woff2' | 'woff' | 'truetype' | 'opentype'
    unicodeRange?: string
    sizeBytes: number
}

export type DevScopeManagedFont = {
    id: string
    family: string
    source: DevScopeManagedFontSource
    faces: DevScopeManagedFontFace[]
    installedAt: string
    sizeBytes: number
}

export type DevScopeManagedFontData = {
    weight: string
    style: 'normal' | 'italic'
    format: DevScopeManagedFontFace['format']
    unicodeRange?: string
    data: Uint8Array
}

export interface DevScopeFontsApi {
    listManaged: () => Promise<DevScopeFontResult<{ fonts: DevScopeManagedFont[] }>>
    listSystem: () => Promise<DevScopeFontResult<{ fonts: string[] }>>
    downloadGoogle: (family: string) => Promise<DevScopeFontResult<{ font: DevScopeManagedFont }>>
    importFile: () => Promise<DevScopeFontResult<{ font?: DevScopeManagedFont; cancelled?: boolean }>>
    removeManaged: (fontId: string) => Promise<DevScopeFontResult<{ removed: boolean }>>
    readManaged: (fontId: string) => Promise<DevScopeFontResult<{ font: DevScopeManagedFont; faces: DevScopeManagedFontData[] }>>
}
