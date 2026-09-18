import { mock } from 'bun:test'
import type { ReactNode } from 'react'
import * as events from '../../src/renderer/src/components/ui/native-overlay-events'

// SSR checks inspect menu/dialog contents. Native adoption, focus and lifecycle
// are covered separately by the real Electron overlay suites.
const inline = ({ children }: { children: ReactNode }) => children
mock.module('../../src/renderer/src/components/ui/native-overlay-portal', () => ({
    ...events,
    NativeOverlayPortal: inline,
    createOverlayPortal: (children: ReactNode) => children,
    createPassivePortal: (children: ReactNode) => children
}))
mock.module('../../src/renderer/src/components/ui/AnchoredNativeOverlay', () => ({ AnchoredNativeOverlay: inline }))
