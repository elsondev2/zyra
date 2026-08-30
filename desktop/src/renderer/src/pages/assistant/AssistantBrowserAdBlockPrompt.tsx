import { LoaderCircle, ShieldCheck, X } from 'lucide-react'

function displayOrigin(origin: string): string {
    try {
        return new URL(origin).hostname
    } catch {
        return origin
    }
}

export function AssistantBrowserAdBlockPrompt({
    origin,
    enabling,
    error,
    onEnable,
    onKeepOff
}: {
    origin: string
    enabling: boolean
    error: string | null
    onEnable: () => void
    onKeepOff: () => void
}) {
    return (
        <aside className="absolute bottom-4 left-1/2 z-[40] w-[min(360px,calc(100%-32px))] -translate-x-1/2 rounded-xl border border-[color-mix(in_srgb,var(--color-text)_13%,transparent)] bg-[color-mix(in_srgb,var(--color-card)_97%,var(--color-bg))] p-3 shadow-[0_18px_54px_rgba(0,0,0,0.38)]" role="dialog" aria-label="Turn on built-in ad blocking">
            <div className="flex items-start gap-2.5">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-400/[0.08] text-emerald-200"><ShieldCheck size={15} /></span>
                <div className="min-w-0 flex-1">
                    <h3 className="text-[11px] font-semibold text-sparkle-text">Block ads in Zyra Browser?</h3>
                    <p className="mt-1 text-[9px] leading-4 text-sparkle-text-muted/72">Zyra found ad or tracking requests on <strong className="font-medium text-sparkle-text-secondary">{displayOrigin(origin)}</strong>. Built-in blocking applies to Browser tabs and stays off for local development sites. Detection happened locally; no browsing data was sent.</p>
                </div>
                <button type="button" onClick={onKeepOff} disabled={enabling} className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-sparkle-text-muted/50 hover:bg-[var(--surface-hover)] hover:text-sparkle-text disabled:opacity-40" aria-label="Keep ad blocking off"><X size={12} /></button>
            </div>
            {error ? <p className="mt-2 rounded-md border border-red-300/15 bg-red-400/[0.06] px-2 py-1.5 text-[8px] leading-3 text-red-200">{error}</p> : null}
            <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={onKeepOff} disabled={enabling} className="h-7 rounded-md border border-[var(--surface-divider)] px-3 text-[9px] text-sparkle-text-muted hover:bg-[var(--surface-hover)] hover:text-sparkle-text disabled:opacity-40">Keep off</button>
                <button type="button" onClick={onEnable} disabled={enabling} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-emerald-300/25 bg-emerald-400/[0.11] px-3 text-[9px] font-semibold text-emerald-100 hover:bg-emerald-400/[0.17] disabled:opacity-50">{enabling ? <LoaderCircle size={11} className="animate-spin" /> : <ShieldCheck size={11} />}Turn on</button>
            </div>
        </aside>
    )
}
