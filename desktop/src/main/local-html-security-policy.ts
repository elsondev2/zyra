/** Scripted previews use the separate zyra: origin; unstamped local documents remain passive. */
export function buildLocalHtmlContentSecurityPolicy(rendererUrl?: string, localScripts = false): string {
    let ancestor = 'file:'
    if (rendererUrl) {
        try {
            const url = new URL(rendererUrl)
            if (['http:', 'https:'].includes(url.protocol)
                && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
                && !url.username && !url.password) ancestor += ` ${url.origin}`
        } catch { /* An invalid development URL must not widen the policy. */ }
    }
    return [
        localScripts ? 'sandbox allow-scripts allow-same-origin' : 'sandbox',
        "default-src 'none'",
        "base-uri 'none'",
        `frame-ancestors ${ancestor}`,
        "object-src 'none'",
        localScripts ? "script-src 'self' 'unsafe-inline'" : "script-src 'none'",
        "worker-src 'none'",
        "connect-src 'none'",
        "frame-src 'none'",
        "child-src 'none'",
        "form-action 'none'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "media-src 'self' data: blob:",
        "font-src 'self' data:"
    ].join('; ')
}
