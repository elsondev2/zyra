type Result = { success: boolean; error?: string }
type PreviewWindowApi = {
    window: { minimize(): void; maximize(): void; close(): void }
    openDesktopSettings(): Promise<Result>
    openInExplorer(path: string): Promise<Result>
    copyToClipboard(text: string): Promise<Result>
}
export type PreviewWindowMenuAction = { id: string; label: string; disabled?: boolean; run: () => void | Promise<void> }
export function previewWindowMenuActions({ api, filePath, isDirty = false, isMaximized, close, reload }: {
    api: PreviewWindowApi; filePath?: string; isDirty?: boolean; isMaximized: boolean; close?: () => void; reload: () => void
}): PreviewWindowMenuAction[] {
    const checked = async (result: Promise<Result>) => {
        const value = await result
        if (!value.success) throw new Error(value.error || 'The action could not finish.')
    }
    return [
        ...(filePath ? [
            { id: 'reveal', label: 'Show in file explorer', run: () => checked(api.openInExplorer(filePath)) },
            { id: 'copy', label: 'Copy file path', run: () => checked(api.copyToClipboard(filePath)) }
        ] : []),
        { id: 'settings', label: 'Settings', run: () => checked(api.openDesktopSettings()) },
        { id: 'reload', label: 'Reload preview', disabled: isDirty, run: () => { if (!isDirty) reload() } },
        { id: 'minimize', label: 'Minimize', run: () => api.window.minimize() },
        { id: 'maximize', label: isMaximized ? 'Restore window' : 'Maximize', run: () => api.window.maximize() },
        { id: 'close', label: 'Close window', run: () => close ? close() : api.window.close() }
    ]
}
