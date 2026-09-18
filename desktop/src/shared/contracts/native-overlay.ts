/** Internal trusted renderer portal host. Names are issued by the main frame only. */
export const NATIVE_OVERLAY_FRAME_PREFIX = 'zyra-native-overlay-'
export const NATIVE_OVERLAY_IPC = {
    prepare: 'devscope:nativeOverlay:prepare',
    recover: 'devscope:nativeOverlay:recover',
    visibility: 'devscope:nativeOverlay:visibility',
    dismissed: 'devscope:nativeOverlay:dismissed',
    linkActivated: 'devscope:nativeOverlay:linkActivated'
} as const

// Browser clients must not proxy these methods into a different renderer owner.
// Absence also makes portal feature detection choose ordinary in-page controls.
const NATIVE_OVERLAY_METHODS = new Set([
    'prepareNativeOverlay', 'recoverNativeOverlay', 'setNativeOverlayVisible',
    'onNativeOverlayDismiss', 'onNativeOverlayLinkActivated'
])
export function isNativeOverlayMethod(value: unknown): boolean {
    return typeof value === 'string' && NATIVE_OVERLAY_METHODS.has(value)
}

export type NativeOverlayPrepareResult = { success: true; frameName: string } | { success: false; error: string }
export type NativeOverlayKind = 'interactive' | 'passive'
/** Bounds in the trusted owner's CSS viewport coordinates. Omitted/null means app-wide. */
export type NativeOverlayBounds = { x: number; y: number; width: number; height: number }
export type NativeOverlayVisibility = { kind: NativeOverlayKind; frameName: string; visible: boolean; revision: number; focus?: boolean; bounds?: NativeOverlayBounds | null }
export type NativeOverlayDismissReason = 'blur' | 'closed'
export type NativeOverlayDismiss = { kind: NativeOverlayKind; frameName: string; reason: NativeOverlayDismissReason }
export type NativeOverlayLinkActivation = {
    kind: 'interactive'
    frameName: string
    sourceUrl: string
    targetUrl: string
}
export type NativeOverlayApi = {
    prepareNativeOverlay: (input: { kind: NativeOverlayKind }) => Promise<NativeOverlayPrepareResult>
    recoverNativeOverlay: (input: { kind: NativeOverlayKind }) => Promise<{ success: boolean; retry?: boolean }>
    setNativeOverlayVisible: (input: NativeOverlayVisibility) => Promise<{ success: boolean; error?: string; bounds?: NativeOverlayBounds | null }>
    onNativeOverlayDismiss: (listener: (dismissal: NativeOverlayDismiss) => void) => () => void
    onNativeOverlayLinkActivated: (listener: (activation: NativeOverlayLinkActivation) => void) => () => void
}
