import type { BrowserWindow } from 'electron'

export function attachWindowStateEvents(window: BrowserWindow, platform: NodeJS.Platform = process.platform): void {
    if (window.isDestroyed()) return
    let maximized = window.isMaximized()
    let fullscreen = window.isFullScreen()
    let resizeLocked = false
    let restoreResizable = window.isResizable()

    const setNativeResizable = (resizable: boolean) => {
        if (window.isResizable() === resizable) return
        const [minWidth, minHeight] = window.getMinimumSize()
        const [maxWidth, maxHeight] = window.getMaximumSize()
        window.setResizable(resizable)
        // Electron freezes size constraints when disabling Windows resizing.
        // Keep the normal constraints so native restore can change geometry.
        if (!resizable) {
            window.setMinimumSize(minWidth, minHeight)
            window.setMaximumSize(maxWidth, maxHeight)
        }
    }
    const syncResizeGuard = () => {
        if (platform !== 'win32' || window.isDestroyed()) return
        const locked = maximized || fullscreen
        if (locked !== resizeLocked) {
            // Preserve an intentionally fixed-size window, including a policy
            // change made while this window was in its normal state.
            if (locked) restoreResizable = window.isResizable()
            resizeLocked = locked
            const resizable = locked ? false : restoreResizable
            setNativeResizable(resizable)
        } else if (locked && window.isResizable()) {
            setNativeResizable(false)
        }
    }
    const publish = () => {
        if (window.isDestroyed() || window.webContents.isDestroyed()) return
        window.webContents.send('window:maximized-changed', maximized || fullscreen)
        window.webContents.send('window:fullscreen-changed', fullscreen)
    }
    const update = () => { syncResizeGuard(); publish() }
    window.on('maximize', () => { maximized = true; update() })
    window.on('unmaximize', () => { maximized = false; update() })
    // On Windows Electron notifies before changing its fullscreen getter.
    // The event carries the new state; reading the getter here keeps a stale
    // resize border and can publish the wrong state to the renderer.
    window.on('enter-full-screen', () => { fullscreen = true; update() })
    window.on('leave-full-screen', () => { fullscreen = false; update() })
    window.webContents.on('did-finish-load', () => {
        if (window.isDestroyed()) return
        maximized = window.isMaximized()
        fullscreen = window.isFullScreen()
        update()
    })
    if (platform === 'win32') window.on('will-resize', (event) => {
        if (window.isDestroyed()) return
        if (maximized || fullscreen || window.isMaximized() || window.isFullScreen()) event.preventDefault()
    })
    syncResizeGuard()
}
