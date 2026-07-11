import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Terminal } from 'lucide-react'
import type { AssistantPendingUserInput } from '@shared/assistant/contracts'
import {
    PLAYGROUND_TERMINAL_ACCESS_APPROVE_OPTION,
    PLAYGROUND_TERMINAL_ACCESS_DECISION_QUESTION_ID,
    PLAYGROUND_TERMINAL_ACCESS_DECLINE_OPTION
} from '@shared/assistant/playground-terminal-access'
import { cn } from '@/lib/utils'

function findTerminalAccessQuestion(request: AssistantPendingUserInput) {
    return request.questions.find((question) => question.id === PLAYGROUND_TERMINAL_ACCESS_DECISION_QUESTION_ID) || request.questions[0] || null
}

export function getPendingTerminalAccessRequest(pendingUserInputs: AssistantPendingUserInput[]): AssistantPendingUserInput | null {
    return pendingUserInputs.find((request) => (
        request.status === 'pending'
        && request.questions.some((question) => question.id === PLAYGROUND_TERMINAL_ACCESS_DECISION_QUESTION_ID)
    )) || null
}

export function AssistantPendingTerminalAccessModal(props: {
    request: AssistantPendingUserInput
    responding: boolean
    onRespond: (requestId: string, answers: Record<string, string | string[]>) => Promise<void>
    onSetTerminalAccess: (enabled: boolean) => void
    onSetRequestMuted: (muted: boolean) => void
}) {
    const {
        request,
        responding,
        onRespond,
        onSetTerminalAccess,
        onSetRequestMuted
    } = props
    const [dontAskAgain, setDontAskAgain] = useState(false)
    const question = useMemo(() => findTerminalAccessQuestion(request), [request])

    useEffect(() => {
        const originalOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = originalOverflow
        }
    }, [])

    if (!question || typeof document === 'undefined') return null

    const respond = async (enabled: boolean) => {
        if (responding) return
        onSetTerminalAccess(enabled)
        if (enabled) {
            onSetRequestMuted(false)
        } else if (dontAskAgain) {
            onSetRequestMuted(true)
        }
        await onRespond(request.requestId, {
            [PLAYGROUND_TERMINAL_ACCESS_DECISION_QUESTION_ID]: enabled
                ? PLAYGROUND_TERMINAL_ACCESS_APPROVE_OPTION
                : PLAYGROUND_TERMINAL_ACCESS_DECLINE_OPTION
        })
    }

    return createPortal((
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md animate-fadeIn">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-sparkle-card p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="terminal-access-title">
                <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/[0.12] text-emerald-200">
                        <Terminal size={17} />
                    </span>
                    <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200/70">Playground Permission</p>
                        <h3 id="terminal-access-title" className="mt-1 text-base font-semibold text-sparkle-text">
                            Terminal access?
                        </h3>
                        <p className="mt-2 text-sm leading-5 text-sparkle-text-secondary">
                            {question.question || 'The assistant is asking to use terminal access from a neutral home-directory cwd.'}
                        </p>
                    </div>
                </div>

                <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2 text-xs text-sparkle-text-secondary">
                    <input
                        type="checkbox"
                        checked={dontAskAgain}
                        onChange={(event) => setDontAskAgain(event.target.checked)}
                        className="h-3.5 w-3.5 rounded border-white/20 bg-transparent accent-emerald-400"
                    />
                    <span>Don’t ask again when terminal access is off</span>
                </label>

                <div className="mt-5 flex items-center justify-end gap-2">
                    <button
                        type="button"
                        disabled={responding}
                        onClick={() => void respond(false)}
                        className={cn(
                            'rounded-lg border border-white/10 px-3 py-1.5 text-sm text-sparkle-text-secondary transition-colors hover:border-white/20 hover:bg-white/[0.03] hover:text-sparkle-text',
                            responding && 'cursor-wait opacity-60'
                        )}
                    >
                        Continue without
                    </button>
                    <button
                        type="button"
                        disabled={responding}
                        onClick={() => void respond(true)}
                        className={cn(
                            'rounded-lg border border-emerald-400/20 bg-emerald-500/15 px-3 py-1.5 text-sm font-medium text-emerald-100 transition-colors hover:border-emerald-300/30 hover:bg-emerald-500/25',
                            responding && 'cursor-wait opacity-70'
                        )}
                    >
                        Allow terminal
                    </button>
                </div>
            </div>
        </div>
    ), document.body)
}
