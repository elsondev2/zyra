import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Keep recovery available even when a browser or chat update throws. */
export class RendererErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
    state: { error: Error | null } = { error: null }

    static getDerivedStateFromError(error: unknown) {
        return { error: error instanceof Error ? error : new Error(String(error)) }
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[RendererFailure]', error.stack || error.message, info.componentStack)
    }

    render() {
        if (!this.state.error) return this.props.children
        const buttonClass = 'rounded-md border border-[var(--surface-divider)] px-3 py-2 text-xs hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]'
        return <main role="alert" className="flex h-screen items-center justify-center bg-[var(--color-bg)] p-6 text-[var(--color-text)]">
            <div className="w-full max-w-lg space-y-4">
                <h1 className="text-base font-medium">The interface ran into an error</h1>
                <p className="text-sm text-[var(--color-text-muted)]">Retry the interface to reconnect to your chats.</p>
                <div className="flex gap-2">
                    <button type="button" className={buttonClass} onClick={() => this.setState({ error: null })}>Retry interface</button>
                    {window.zyraKeybindings && <button type="button" className={buttonClass} onClick={() => { void window.zyraKeybindings?.command('app.devtools').catch(error => console.error('[RendererFailure] Could not open Developer tools', error)) }}>Developer tools</button>}
                </div>
                <details className="text-xs text-[var(--color-text-muted)]">
                    <summary className="cursor-pointer">Error details</summary>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words">{this.state.error.message}</pre>
                </details>
            </div>
        </main>
    }
}
