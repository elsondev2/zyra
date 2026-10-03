import { ArrowLeft, Globe2, RotateCw } from 'lucide-react'
import { classifyAssistantBrowserFailure } from './assistant-browser-error'

interface AssistantBrowserErrorPageProps {
    url: string
    error: string | null
    canGoBack: boolean
    onBack: () => void
    onRetry: () => void
}

export function AssistantBrowserErrorPage({ url, error, canGoBack, onBack, onRetry }: AssistantBrowserErrorPageProps) {
    const failure = classifyAssistantBrowserFailure(error)

    return (
        <section className="absolute inset-0 z-20 flex items-center justify-center overflow-auto bg-sparkle-bg px-6 py-10 text-sparkle-text" aria-label="Page could not be loaded">
            <div className="w-full max-w-[560px] -translate-y-10">
                <h2 className="flex items-center gap-2.5 text-[21px] font-semibold tracking-[-0.03em] text-sparkle-text">
                    <Globe2 size={18} strokeWidth={1.7} className="shrink-0 text-sparkle-text-muted" aria-hidden="true" />
                    {failure.title}
                </h2>
                <p className="mt-2 max-w-[510px] text-[13px] leading-[1.65] text-sparkle-text-secondary">
                    {failure.message} {failure.hint}
                </p>
                {url ? <p className="mt-5 max-w-full truncate border-l border-[var(--surface-divider)] pl-3 font-mono text-[11px] leading-5 text-sparkle-text-muted" title={url}>{url}</p> : null}
                <div className="mt-6 flex flex-wrap items-center gap-3">
                    <button type="button" onClick={onRetry} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--accent-primary)] px-3 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]">
                        <RotateCw size={13} /> Try again
                    </button>
                    {canGoBack ? <button type="button" onClick={onBack} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-sparkle-text-muted transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]">
                        <ArrowLeft size={13} /> Back
                    </button> : null}
                </div>
            </div>
        </section>
    )
}
