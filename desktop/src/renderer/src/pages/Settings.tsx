import { ArrowLeft, Wrench } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function Settings() {
    const navigate = useNavigate()

    return (
        <div className="flex min-h-[calc(100vh-82px)] items-center justify-center animate-fadeIn">
            <section className="w-full max-w-md rounded-2xl border border-white/10 bg-sparkle-card/80 p-7 text-center shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
                <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] text-sparkle-text-secondary">
                    <Wrench size={20} strokeWidth={1.7} />
                </div>
                <h1 className="text-xl font-semibold text-sparkle-text">Settings coming soon</h1>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-sparkle-text-secondary">
                    For now, Zyra is focused on the chat shell.
                </p>
                <button
                    type="button"
                    onClick={() => navigate('/assistant')}
                    className="mx-auto mt-6 inline-flex h-9 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-4 text-sm font-medium text-sparkle-text-secondary transition-colors hover:bg-white/[0.06] hover:text-sparkle-text"
                >
                    <ArrowLeft size={15} strokeWidth={1.8} />
                    Back to chat
                </button>
            </section>
        </div>
    )
}
