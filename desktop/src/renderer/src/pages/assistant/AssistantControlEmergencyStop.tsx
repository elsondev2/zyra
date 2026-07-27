import { ShieldAlert } from 'lucide-react'

export function AssistantControlEmergencyStop({ active, onStop }: { active: boolean; onStop: () => void }) {
    return (
        <button
            type="button"
            onClick={onStop}
            disabled={!active}
            className="inline-flex h-7 items-center justify-center gap-1.5 border border-red-400/25 bg-red-500/[0.08] px-2 text-[9px] font-semibold text-red-100 hover:bg-red-500/[0.14] disabled:border-white/[0.06] disabled:bg-white/[0.02] disabled:text-sparkle-text-muted/40"
            title="Revokes every grant, aborts actions, detaches drivers, and invalidates observations"
        >
            <ShieldAlert size={11} />
            Emergency stop
        </button>
    )
}
