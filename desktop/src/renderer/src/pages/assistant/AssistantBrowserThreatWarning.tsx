import { ArrowLeft, LoaderCircle, ShieldAlert } from 'lucide-react'
import type { DevScopeBrowserThreatWarning } from '@shared/contracts/devscope-api'

export function AssistantBrowserThreatWarning({
    warning,
    busy,
    error,
    onBack,
    onProceed
}: {
    warning: DevScopeBrowserThreatWarning
    busy: boolean
    error: string | null
    onBack: () => void
    onProceed: () => void
}) {
    const isTest = warning.source === 'test'
    return (
        <section
            className="relative z-[20] flex h-full w-full items-center justify-center bg-[#941923] px-6 py-10 text-white"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="browser-threat-warning-title"
            aria-describedby="browser-threat-warning-description"
        >
            <div className="w-full max-w-[460px]">
                <span className="mb-5 inline-flex size-12 items-center justify-center rounded-lg bg-black/15 text-white">
                    <ShieldAlert size={27} strokeWidth={2.2} aria-hidden="true" />
                </span>
                <h2 id="browser-threat-warning-title" className="text-[28px] font-bold tracking-[-0.025em] text-white">{isTest ? 'Phishing protection works' : 'Dangerous site blocked'}</h2>
                <p id="browser-threat-warning-description" className="mt-3 max-w-[440px] text-[13px] leading-5 text-white/85">
                    {isTest
                        ? 'This harmless test page was blocked before it loaded.'
                        : 'Reported for phishing. Do not enter passwords, payment details, or verification codes.'}
                </p>
                <p className="mt-5 truncate border-l-2 border-white/35 pl-3 text-[11px] font-medium text-white/70" title={warning.url}>{warning.hostname}</p>
                {error ? <p className="mt-4 rounded-md border border-white/20 bg-black/15 px-3 py-2 text-[10px] leading-4 text-white">{error}</p> : null}
                <div className="mt-7 flex flex-wrap items-center gap-2.5">
                    <button
                        type="button"
                        onClick={onBack}
                        disabled={busy}
                        autoFocus
                        className="inline-flex h-10 items-center gap-2 rounded-md bg-white px-4 text-[11px] font-semibold text-[#72111a] hover:bg-white/90 disabled:opacity-45"
                    >
                        <ArrowLeft size={14} aria-hidden="true" />
                        Back to safety
                    </button>
                    <button
                        type="button"
                        onClick={onProceed}
                        disabled={busy}
                        className="inline-flex h-10 items-center gap-2 rounded-md border border-white/25 px-4 text-[10px] text-white/65 hover:bg-black/10 hover:text-white disabled:opacity-45"
                    >
                        {busy ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> : null}
                        Continue anyway
                    </button>
                </div>
            </div>
        </section>
    )
}
