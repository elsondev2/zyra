export function shouldShowAssistantBrowserNativeView({
    hasPage,
    requestedVisible,
    nativeViewOccluded
}: {
    hasPage: boolean
    requestedVisible: boolean
    nativeViewOccluded: boolean
}): boolean {
    return hasPage && requestedVisible && !nativeViewOccluded
}
