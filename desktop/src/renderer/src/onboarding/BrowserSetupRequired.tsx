import { MonitorUp } from 'lucide-react'

export function BrowserSetupRequired({ unavailable = false }: { unavailable?: boolean }) {
    return (
        <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-sparkle-bg text-sparkle-text">
            <header className="flex h-[46px] shrink-0 items-center border-b border-[var(--surface-divider)] px-5">
                <span className="text-[13px] font-semibold tracking-[-0.01em]">Zyra</span>
                <span className="ml-2 text-[11px] text-sparkle-text-muted">Browser</span>
            </header>
            <main className="flex min-h-0 flex-1 items-center justify-center px-6 py-12">
                <section className="w-full max-w-[560px] text-center" aria-labelledby="browser-setup-title">
                    <div className="mx-auto mb-6 inline-flex size-11 items-center justify-center rounded-xl border border-[var(--surface-divider)] bg-[var(--surface-floating)] text-sparkle-text-secondary">
                        <MonitorUp size={21} strokeWidth={1.6} />
                    </div>
                    <h1 id="browser-setup-title" className="text-[26px] font-medium tracking-[-0.035em]">
                        {unavailable ? 'Zyra Desktop is unavailable' : 'Finish setup in Zyra Desktop'}
                    </h1>
                    <p className="mx-auto mt-3 max-w-[460px] text-[14px] leading-6 text-sparkle-text-secondary">
                        {unavailable
                            ? 'Open Zyra Desktop on this computer, then refresh this page.'
                            : 'Setup controls your OpenAI connection and this device’s defaults. This browser will unlock as soon as Desktop setup is complete.'}
                    </p>
                    <div className="mx-auto mt-7 h-px w-16 bg-[var(--surface-divider)]" />
                    <p className="mt-5 text-[11px] text-sparkle-text-muted">You can close this tab and return later.</p>
                </section>
            </main>
        </div>
    )
}
