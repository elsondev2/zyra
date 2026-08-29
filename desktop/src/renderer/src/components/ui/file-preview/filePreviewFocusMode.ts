export const FILE_PREVIEW_FOCUS_STATE_EVENT = 'zyra:file-preview-focus-state'
export const FILE_PREVIEW_TOGGLE_NAVIGATOR_EVENT = 'zyra:file-preview-toggle-navigator'

export type FilePreviewFocusState = {
    active: boolean
    leftPanelOpen: boolean
}

export function publishFilePreviewFocusState(state: FilePreviewFocusState): void {
    if (state.active) document.documentElement.dataset.filePreviewTitlebarNavigator = 'true'
    else delete document.documentElement.dataset.filePreviewTitlebarNavigator
    window.dispatchEvent(new CustomEvent<FilePreviewFocusState>(FILE_PREVIEW_FOCUS_STATE_EVENT, {
        detail: state
    }))
}
