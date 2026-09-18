import { addOverlayEventListener } from '@/components/ui/native-overlay-portal'
import { useEffect, useId, useMemo, useState } from 'react'
import { createOverlayPortal as createPortal } from '@/components/ui/native-overlay-portal'
import { Bot, ChevronRight, X } from 'lucide-react'
import type { AssistantPendingUserInput } from '@shared/assistant/contracts'
import { formatAssistantUserInputAnswer } from './assistant-pending-user-input'

type QuestionResponseEntry = {
    id: string
    header: string
    question: string
    answer: string
}

function buildQuestionResponseEntries(input: AssistantPendingUserInput): QuestionResponseEntry[] {
    return input.questions.map((question, index) => ({
        id: question.id || `question-${index + 1}`,
        header: question.header || `Question ${index + 1}`,
        question: question.question,
        answer: formatAssistantUserInputAnswer(question, input.answers?.[question.id])
    }))
}

export function AssistantQuestionResponseDialog(props: {
    entries: QuestionResponseEntry[]
    onClose: () => void
}) {
    const titleId = useId()
    const multiple = props.entries.length > 1
    return (
        <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            data-assistant-question-dialog="true"
            className="flex max-h-[min(680px,85vh)] w-[min(520px,calc(100vw-32px))] min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--surface-divider)] bg-[var(--color-card)] shadow-[0_24px_80px_rgba(0,0,0,0.3)]"
        >
            <header className="flex min-h-14 shrink-0 items-center gap-2.5 px-5">
                <Bot size={16} className="shrink-0 text-sparkle-text-secondary" aria-hidden="true" />
                <h2 id={titleId} className="min-w-0 flex-1 truncate text-[13px] font-medium text-sparkle-text">Your response</h2>
                {multiple ? <span className="text-[11px] tabular-nums text-sparkle-text-muted">{props.entries.length} answers</span> : null}
                <button
                    type="button"
                    onClick={props.onClose}
                    className="-mr-2 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-sparkle-text-muted transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]"
                    aria-label="Close full response"
                >
                    <X size={15} />
                </button>
            </header>
            <div className="custom-scrollbar min-h-0 overflow-y-auto px-5 pb-5">
                <div className="space-y-6">
                    {props.entries.map((entry, index) => (
                        <section key={entry.id} data-assistant-answer-section="true" className="min-w-0">
                            {multiple ? <p className="mb-2 text-[11px] text-sparkle-text-muted">{index + 1}. {entry.header}</p> : null}
                            <p data-assistant-full-question="true" className="whitespace-pre-wrap break-words text-[14px] font-normal leading-6 text-sparkle-text">{entry.question}</p>
                            <div data-assistant-full-answer="true" className="mt-3 rounded-xl bg-[var(--surface-hover)] px-3.5 py-3">
                                <p className="mb-1 text-[11px] text-sparkle-text-muted">Your answer</p>
                                <p className="whitespace-pre-wrap break-words text-[13px] font-normal leading-[22px] text-sparkle-text">{entry.answer}</p>
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </section>
    )
}

function AssistantQuestionResponseModal(props: {
    entries: QuestionResponseEntry[]
    onClose: () => void
}) {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') props.onClose()
        }
        const removeOverlayListener = addOverlayEventListener('keydown', handleKeyDown)
        return () => removeOverlayListener()
    }, [props.onClose])

    if (typeof document === 'undefined') return null

    return createPortal(
        <div
            className="fixed inset-0 z-[2147482000] flex items-center justify-center bg-black/65 p-4 backdrop-blur-md"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) props.onClose()
            }}
        >
            <AssistantQuestionResponseDialog entries={props.entries} onClose={props.onClose} />
        </div>,
        document.body
    )
}
export function AssistantQuestionResponse(props: { input: AssistantPendingUserInput; minimal?: boolean }) {
    const [open, setOpen] = useState(false)
    const entries = useMemo(() => buildQuestionResponseEntries(props.input), [props.input])
    const first = entries[0]
    if (!first) return null

    return (
        <div data-assistant-question-response="true" className="min-w-0 w-full">
            <div data-assistant-question-response-label="true" className="mb-1.5 flex items-center justify-end gap-1.5 text-[10px] font-medium text-sparkle-text-muted">
                <Bot size={12} aria-hidden="true" />
                <span>{entries.length === 1 ? 'Answered agent question' : `Answered ${entries.length} agent questions`}</span>
            </div>
            <button
                type="button"
                data-assistant-question-response-card="true"
                onClick={() => setOpen(true)}
                aria-label={entries.length === 1 ? 'View full response to agent question' : `View full responses to ${entries.length} agent questions`}
                aria-haspopup="dialog"
                className={`flex w-full min-w-0 items-center gap-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)] ${props.minimal
                    ? 'rounded-2xl bg-[var(--surface-hover)] px-3.5 py-2.5 hover:brightness-110'
                    : 'rounded-[1.15rem] border border-white/10 bg-white/[0.03] px-4 py-2.5 hover:bg-white/[0.05]'}`}
            >
                <span className="min-w-0 flex-1">
                    <span data-assistant-question-preview="true" className="block truncate text-[12px] leading-5 text-sparkle-text-secondary">{first.question}</span>
                    <span data-assistant-answer-preview="true" className="mt-1 block line-clamp-2 whitespace-pre-wrap text-[13px] leading-5 text-sparkle-text">{first.answer}</span>
                </span>
                <ChevronRight size={14} className="shrink-0 text-sparkle-text-muted" aria-hidden="true" />
            </button>
            {open ? <AssistantQuestionResponseModal entries={entries} onClose={() => setOpen(false)} /> : null}
        </div>
    )
}
