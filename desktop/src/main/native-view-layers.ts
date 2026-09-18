import type { BrowserWindow, View } from 'electron'

type NativeLayer = 'browser' | 'recording' | 'overlay'
const layers = new WeakMap<View, number>()
const priority: Record<NativeLayer, number> = { browser: 0, recording: 10, overlay: 20 }

/** Browser pages < recording controls < app dialogs, independent of reparent order. */
export function addNativeWindowView(window: BrowserWindow, view: View, layer: NativeLayer): void {
    layers.set(view, priority[layer])
    const children = window.contentView.children
    if (!children.includes(view)) window.contentView.addChildView(view)
    const current = window.contentView.children
    const ordered = [...current].sort((left, right) => (layers.get(left) || 0) - (layers.get(right) || 0))
    if (ordered.every((entry, index) => entry === current[index])) return
    // Reordering retains the exact views, bounds, visibility and guest contents.
    for (const entry of ordered) window.contentView.addChildView(entry)
}
