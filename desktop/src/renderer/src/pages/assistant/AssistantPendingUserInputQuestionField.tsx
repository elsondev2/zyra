import {
    DndContext,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent
} from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, CircleHelp, FileText, GripVertical, SquarePen } from 'lucide-react'
import type { AssistantUserInputAnswer, AssistantUserInputQuestion } from '@shared/assistant/contracts'
import { AnimatedHeight } from '@/components/ui/AnimatedHeight'
import { cn } from '@/lib/utils'
import { AssistantCheckbox } from './AssistantCheckbox'
import { reorderAssistantUserInputRanking } from './assistant-pending-user-input'

const CUSTOM_ANSWER_LABEL = 'Something else'

function getOptions(question: AssistantUserInputQuestion) {
    if (question.type === 'confirm' && question.options.length < 2) {
        return [
            { label: 'Yes', description: 'Confirm and continue' },
            { label: 'No', description: 'Decline' }
        ]
    }
    return question.options
}

function answerValues(answer: AssistantUserInputAnswer | null): string[] {
    return Array.isArray(answer) ? answer : typeof answer === 'string' && answer ? [answer] : []
}

function AssistantRankingRow(props: {
    label: string
    index: number
    ranking: string[]
    responding: boolean
    onChange: (value: string[]) => void
}) {
    const { label, index, ranking, responding, onChange } = props
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: label,
        disabled: responding
    })

    return (
        <div
            ref={setNodeRef}
            data-ranking-dragging={isDragging ? 'true' : 'false'}
            style={{
                transform: CSS.Transform.toString(transform),
                transition: isDragging ? undefined : transition || 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1)',
                zIndex: isDragging ? 30 : undefined
            }}
            className={cn(
                'group/ranking relative flex select-none items-center gap-2 rounded-2xl border px-2.5 py-1.5 will-change-transform transition-[border-color,background-color,box-shadow]',
                isDragging
                    ? 'border-[var(--accent-primary)] bg-[color-mix(in_srgb,var(--accent-primary)_16%,var(--color-card))] shadow-[0_14px_32px_rgba(0,0,0,0.34),0_0_0_1px_color-mix(in_srgb,var(--accent-primary)_28%,transparent)]'
                    : 'border-[color-mix(in_srgb,var(--accent-primary)_10%,transparent)] bg-white/[0.025] hover:border-[color-mix(in_srgb,var(--accent-primary)_34%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent-primary)_7%,transparent)]'
            )}
        >
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent-primary)_16%,transparent)] px-1.5 text-[10px] font-semibold tabular-nums text-[color-mix(in_srgb,var(--accent-primary)_72%,var(--color-text))] ring-1 ring-inset ring-[color-mix(in_srgb,var(--accent-primary)_18%,transparent)]">{index + 1}</span>
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-sparkle-text">{label}</span>
            <button
                type="button"
                disabled={responding}
                {...attributes}
                {...listeners}
                className="inline-flex size-7 shrink-0 touch-none cursor-grab items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent-primary)_8%,transparent)] text-[color-mix(in_srgb,var(--accent-primary)_68%,var(--color-text-muted))] outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--accent-primary)_18%,transparent)] hover:text-[var(--accent-primary)] active:cursor-grabbing focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-30 group-hover/ranking:bg-[color-mix(in_srgb,var(--accent-primary)_13%,transparent)]"
                title={`Drag ${label} to reorder`}
                aria-label={`Drag ${label} to reorder`}
            ><GripVertical size={14} /></button>
            <button type="button" disabled={responding || index === 0} onClick={() => {
                const next = [...ranking]
                ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
                onChange(next)
            }} className="inline-flex size-7 items-center justify-center rounded-full text-sparkle-text-muted hover:bg-white/[0.06] hover:text-sparkle-text disabled:opacity-25" aria-label={`Move ${label} up`}><ArrowUp size={13} /></button>
            <button type="button" disabled={responding || index === ranking.length - 1} onClick={() => {
                const next = [...ranking]
                ;[next[index + 1], next[index]] = [next[index], next[index + 1]]
                onChange(next)
            }} className="inline-flex size-7 items-center justify-center rounded-full text-sparkle-text-muted hover:bg-white/[0.06] hover:text-sparkle-text disabled:opacity-25" aria-label={`Move ${label} down`}><ArrowDown size={13} /></button>
        </div>
    )
}

function AssistantRankingField(props: {
    questionId: string
    ranking: string[]
    responding: boolean
    onRankingChange: (questionId: string, value: string[]) => void
}) {
    const { questionId, ranking, responding, onRankingChange } = props
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
    const handleDragEnd = (event: DragEndEvent) => {
        const activeLabel = String(event.active.id)
        const targetLabel = event.over ? String(event.over.id) : ''
        if (!targetLabel || activeLabel === targetLabel) return
        onRankingChange(questionId, reorderAssistantUserInputRanking(ranking, activeLabel, targetLabel))
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={handleDragEnd}
        >
            <SortableContext items={ranking} strategy={verticalListSortingStrategy}>
                <div data-guided-animate className="space-y-1.5">
                    {ranking.map((label, index) => (
                        <AssistantRankingRow
                            key={label}
                            label={label}
                            index={index}
                            ranking={ranking}
                            responding={responding}
                            onChange={(value) => onRankingChange(questionId, value)}
                        />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    )
}

export function AssistantPendingUserInputQuestionField(props: {
    question: AssistantUserInputQuestion
    answer: AssistantUserInputAnswer | null
    responding: boolean
    expandedOptionKey: string | null
    showCustomComposer: boolean
    setExpandedOptionKey: (value: string | null | ((current: string | null) => string | null)) => void
    onSelectOption: (questionId: string, optionLabel: string) => void
    onToggleOption: (questionId: string, optionLabel: string) => void
    onSelectCustom: (questionId: string) => void
    onScalarChange: (questionId: string, value: string) => void
    onRankingChange: (questionId: string, value: string[]) => void
}) {
    const {
        question,
        answer,
        responding,
        expandedOptionKey,
        showCustomComposer,
        setExpandedOptionKey,
        onSelectOption,
        onToggleOption,
        onSelectCustom,
        onScalarChange,
        onRankingChange
    } = props
    const options = getOptions(question)
    const selectedValues = answerValues(answer)
    const isMultiple = question.type === 'multi_select' || (question.type === 'file_select' && question.multiple !== false)

    if (question.type === 'text') return null

    if (question.type === 'number') {
        return (
            <input
                data-guided-animate
                type="number"
                value={typeof answer === 'string' ? answer : ''}
                min={question.min}
                max={question.max}
                step={question.step || 'any'}
                placeholder={question.placeholder || 'Enter a number'}
                disabled={responding}
                onChange={(event) => onScalarChange(question.id, event.target.value)}
                className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.025] px-3 text-[13px] text-sparkle-text outline-none transition-colors placeholder:text-sparkle-text-muted focus:border-[var(--accent-primary)]/45"
            />
        )
    }

    if (question.type === 'date') {
        return (
            <input
                data-guided-animate
                type="date"
                value={typeof answer === 'string' ? answer : ''}
                disabled={responding}
                onChange={(event) => onScalarChange(question.id, event.target.value)}
                className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.025] px-3 text-[13px] text-sparkle-text outline-none transition-colors focus:border-[var(--accent-primary)]/45"
            />
        )
    }

    if (question.type === 'ranking') {
        const ranking = Array.isArray(answer) && answer.length === options.length
            ? answer
            : options.map((option) => option.label)
        return (
            <AssistantRankingField
                questionId={question.id}
                ranking={ranking}
                responding={responding}
                onRankingChange={onRankingChange}
            />
        )
    }

    return (
        <div className="space-y-1.5">
            {options.map((option, index) => {
                const selected = selectedValues.includes(option.label)
                const optionKey = `${question.id}:${option.label}`
                const hasDetails = Boolean(option.description && option.description !== option.label)
                const detailsOpen = expandedOptionKey === optionKey && hasDetails
                const choose = () => isMultiple
                    ? onToggleOption(question.id, option.label)
                    : onSelectOption(question.id, option.label)
                return (
                    <div
                        data-guided-animate
                        key={optionKey}
                        onClick={choose}
                        onKeyDown={(event) => {
                            if (responding || (event.key !== 'Enter' && event.key !== ' ')) return
                            event.preventDefault()
                            choose()
                        }}
                        role={isMultiple ? 'checkbox' : 'radio'}
                        tabIndex={responding ? -1 : 0}
                        aria-checked={selected}
                        aria-disabled={responding}
                        className={cn(
                            'group/option w-full rounded-2xl px-3 py-2 text-left transition-colors',
                            selected ? 'bg-emerald-500/[0.08] text-sparkle-text' : 'bg-white/[0.02] text-sparkle-text-secondary hover:bg-white/[0.04] hover:text-sparkle-text',
                            responding && 'cursor-not-allowed opacity-60'
                        )}
                    >
                        <div className="flex items-start gap-3">
                            <span className={cn('inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums', selected ? 'bg-emerald-500/18 text-emerald-200' : 'bg-white/[0.08] text-sparkle-text-secondary')}>
                                {question.type === 'file_select' ? <FileText size={10} /> : index + 1}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2">
                                    <span className="text-[12px] font-medium">{option.label}</span>
                                    {option.recommended ? <span className="rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-emerald-200">Recommended</span> : null}
                                </span>
                            </span>
                            {hasDetails ? (
                                <button type="button" disabled={responding} onClick={(event) => {
                                    event.stopPropagation()
                                    setExpandedOptionKey((current) => current === optionKey ? null : optionKey)
                                }} className="inline-flex size-5 items-center justify-center rounded-full bg-white/[0.05] text-sparkle-text-muted hover:bg-white/[0.1] hover:text-sparkle-text" aria-label={detailsOpen ? `Hide details for ${option.label}` : `Show details for ${option.label}`}><CircleHelp size={12} /></button>
                            ) : null}
                            {isMultiple ? (
                                <span onClick={(event) => event.stopPropagation()}><AssistantCheckbox checked={selected} disabled={responding} label={option.label} onChange={choose} /></span>
                            ) : (
                                <span className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border', selected ? 'border-emerald-300/35 bg-emerald-400/12' : 'border-white/12')}><span className={cn('size-2 rounded-full', selected ? 'bg-emerald-200' : 'bg-transparent')} /></span>
                            )}
                        </div>
                        <AnimatedHeight isOpen={detailsOpen} duration={220}><p className="pl-8 pr-1 pt-1 text-[11px] leading-4 text-sparkle-text-muted">{option.description}</p></AnimatedHeight>
                    </div>
                )
            })}

            {question.allowOther ? (
                <button
                    data-guided-animate
                    type="button"
                    disabled={responding}
                    onClick={() => onSelectCustom(question.id)}
                    className={cn('flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-[12px] transition-colors', showCustomComposer ? 'bg-sky-500/[0.08] text-sparkle-text' : 'bg-white/[0.02] text-sparkle-text-secondary hover:bg-white/[0.04] hover:text-sparkle-text')}
                    aria-pressed={showCustomComposer}
                >
                    <span className={cn('inline-flex size-5 items-center justify-center rounded-full', showCustomComposer ? 'bg-sky-500/18 text-sky-200' : 'bg-white/[0.08]')}><SquarePen size={10} /></span>
                    <span className="font-medium">{CUSTOM_ANSWER_LABEL}</span>
                </button>
            ) : null}
        </div>
    )
}
