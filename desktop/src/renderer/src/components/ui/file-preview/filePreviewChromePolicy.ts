export type FilePreviewChromeContext = 'quick-view' | 'peek' | 'detail' | 'workspace'

export type FilePreviewChromePolicy = {
    navigator: 'none' | 'requested' | 'always'
    history: 'none' | 'available' | 'always'
    allowFullscreen: boolean
    showTabs: boolean
}

const FILE_PREVIEW_CHROME_POLICIES: Record<FilePreviewChromeContext, FilePreviewChromePolicy> = {
    'quick-view': {
        navigator: 'none',
        history: 'none',
        allowFullscreen: false,
        showTabs: false
    },
    peek: {
        navigator: 'requested',
        history: 'available',
        allowFullscreen: false,
        showTabs: true
    },
    detail: {
        navigator: 'requested',
        history: 'always',
        allowFullscreen: true,
        showTabs: true
    },
    workspace: {
        navigator: 'always',
        history: 'always',
        allowFullscreen: true,
        showTabs: true
    }
}

export function resolveFilePreviewChromePolicy(context: FilePreviewChromeContext): FilePreviewChromePolicy {
    return FILE_PREVIEW_CHROME_POLICIES[context]
}
