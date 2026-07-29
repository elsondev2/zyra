export type PreviewTerminalRuntime = {
    Terminal: typeof import('xterm').Terminal
    FitAddon: typeof import('xterm-addon-fit').FitAddon
    WebLinksAddon: typeof import('xterm-addon-web-links').WebLinksAddon
}

let runtimePromise: Promise<PreviewTerminalRuntime> | null = null

export function loadPreviewTerminalRuntime(): Promise<PreviewTerminalRuntime> {
    if (!runtimePromise) {
        runtimePromise = Promise.all([
            import('xterm'),
            import('xterm-addon-fit'),
            import('xterm-addon-web-links')
        ]).then(([xterm, fit, webLinks]) => ({
            Terminal: xterm.Terminal,
            FitAddon: fit.FitAddon,
            WebLinksAddon: webLinks.WebLinksAddon
        })).catch((error) => {
            runtimePromise = null
            throw error
        })
    }
    return runtimePromise
}
