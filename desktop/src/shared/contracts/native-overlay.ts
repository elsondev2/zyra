/** Internal trusted renderer portal host. Names are issued by the main frame only. */
export const NATIVE_OVERLAY_FRAME_PREFIX = 'zyra-native-overlay-'
export const NATIVE_OVERLAY_IPC = {
    prepare: 'devscope:nativeOverlay:prepare',
    recover: 'devscope:nativeOverlay:recover',
    visibility: 'devscope:nativeOverlay:visibility',
    dismissed: 'devscope:nativeOverlay:dismissed'
} as const

export type NativeOverlayPrepareResult = { success: true; frameName: string } | { success: false; error: string }
export type NativeOverlayKind = 'interactive' | 'passive'
export type NativeOverlayVisibility = { kind: NativeOverlayKind; frameName: string; visible: boolean; revision: number; focus?: boolean }
export type NativeOverlayDismissReason = 'blur' | 'closed'
export type NativeOverlayDismiss = { kind: NativeOverlayKind; frameName: string; reason: NativeOverlayDismissReason }
export type NativeOverlayApi = {
    prepareNativeOverlay: (input: { kind: NativeOverlayKind }) => Promise<NativeOverlayPrepareResult>
    recoverNativeOverlay: (input: { kind: NativeOverlayKind }) => Promise<{ success: boolean; retry?: boolean }>
    setNativeOverlayVisible: (input: NativeOverlayVisibility) => Promise<{ success: boolean; error?: string }>
    onNativeOverlayDismiss: (listener: (dismissal: NativeOverlayDismiss) => void) => () => void
}
