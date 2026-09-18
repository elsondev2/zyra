/** Menus live above the guest; only the selected page/slot controls visibility. */
export function shouldShowAssistantBrowserNativeView({
    hasPage,
    requestedVisible
}: {
    hasPage: boolean
    requestedVisible: boolean
}): boolean {
    return hasPage && requestedVisible
}
