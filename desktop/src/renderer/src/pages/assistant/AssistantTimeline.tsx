import type { ReactNode, RefObject } from 'react'
import { memo, useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import type { AssistantActivity, AssistantMessage, AssistantProposedPlan, AssistantSessionTurnUsageEntry } from '@shared/assistant/contracts'
import type { PreviewOpenOptions } from '@/components/ui/file-preview/types'
import type { AssistantTextStreamingMode, AssistantToolOutputDefaultMode } from '@/lib/settings'
import { cn } from '@/lib/utils'
import type { AssistantDiffTarget } from './assistant-diff-types'
import {
    TimelineContextCompactionMarker,
    TimelineCommandCheckpoint,
    TimelineCommandCheckpointGroup,
    TimelineChatLoadingState,
    TimelineEmptyState,
    TimelineIssueList,
    TimelineModelNotice,
    TimelineMessage,
    TimelineProposedPlan,
    TimelineThought,
    TimelineThoughtGroup,
    TimelineToolCallList,
    TimelineWorkTraceGroup,
    TimelineWorkingIndicator
} from './AssistantTimelineRows'
import { TimelineTurnWorkSummary } from './AssistantTimelineWorkSummary'
import { AssistantTimelineCheckpointRail } from './AssistantTimelineCheckpointRail'
import {
    buildTimelineRows,
    countRunningCommandActivities,
    findRelatedCommandActivityId,
    getTimelineActivityDomId,
    getTimelineMessageDomId,
    isCommandCheckpointActivity,
    isContextCompactionActivity,
    isInternalAssistantActivity,
    isIssueActivity,
    isModelNoticeActivity,
    type TimelineDisplayRow,
    type TimelineRenderRow
} from './assistant-timeline-helpers'
import { groupTimelineRowsIntoWorkSummaries } from './assistant-turn-work'
import { useAssistantTimelineEntries } from './useAssistantTimelineEntries'
import { useAssistantTimelineWindow } from './useAssistantTimelineWindow'

type AssistantTimelineProps = {
    messages: AssistantMessage[]
    activities: AssistantActivity[]
    proposedPlans?: AssistantProposedPlan[]
    projectLabel?: string | null
    projectTitle?: string | null
    sessionMode?: 'work' | 'playground'
    projectRootPath?: string | null
    assistantMessageFilePath?: string | null
    windowKey?: string
    scrollContainerRef?: RefObject<HTMLDivElement | null>
    overlayContainerRef?: RefObject<HTMLDivElement | null>
    railHostRef?: RefObject<HTMLDivElement | null>
    isWorking?: boolean
    workingLabel?: string
    activeWorkStartedAt?: string | null
    latestAssistantMessageId?: string | null
    latestTurnStartedAt?: string | null
    turnUsageById?: ReadonlyMap<string, AssistantSessionTurnUsageEntry>
    deletingMessageId?: string | null
    loadingChats?: boolean
    assistantTextStreamingMode?: AssistantTextStreamingMode
    assistantToolOutputDefaultMode?: AssistantToolOutputDefaultMode
    isConnecting?: boolean
    onRequestDeleteUserMessage?: (message: AssistantMessage) => void
    onImplementProposedPlan?: (plan: AssistantProposedPlan) => Promise<void> | void
    onShowPlanPanel?: () => void
    onOpenAttachmentPreview?: (
        file: { name: string; path: string },
        ext: string,
        options?: PreviewOpenOptions
    ) => Promise<void> | void
    onOpenInternalLink?: (href: string) => Promise<void> | void
    onOpenFilePath?: (filePath: string) => Promise<void> | void
    onViewDiff?: (target: AssistantDiffTarget) => void
}

function AssistantTimelineImpl({
    messages,
    activities,
    proposedPlans = [],
    projectLabel = null,
    projectTitle = null,
    sessionMode = 'work',
    projectRootPath = null,
    assistantMessageFilePath = null,
    windowKey = 'default',
    scrollContainerRef,
    overlayContainerRef,
    railHostRef,
    isWorking = false,
    workingLabel = 'Working...',
    activeWorkStartedAt = null,
    latestAssistantMessageId = null,
    latestTurnStartedAt = null,
    turnUsageById,
    deletingMessageId = null,
    loadingChats = false,
    assistantTextStreamingMode = 'stream',
    assistantToolOutputDefaultMode = 'expanded',
    isConnecting = false,
    onRequestDeleteUserMessage,
    onImplementProposedPlan,
    onShowPlanPanel,
    onOpenAttachmentPreview,
    onOpenInternalLink,
    onOpenFilePath,
    onViewDiff
}: AssistantTimelineProps) {
    const timelineEntryCount = messages.length + activities.length + proposedPlans.length
    const timelineWindow = useAssistantTimelineWindow({
        entryCount: timelineEntryCount,
        resetKey: windowKey,
        scrollContainerRef
    })
    const timelineRootRef = useRef<HTMLDivElement | null>(null)
    const pendingActivityRevealRef = useRef<string | null>(null)
    const revealActivityInDom = useCallback((activityId: string): boolean => {
        const target = document.getElementById(getTimelineActivityDomId(activityId))
        if (!target) return false
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })
        target.animate(
            [
                { backgroundColor: 'rgba(93, 228, 199, 0)', boxShadow: '0 0 0 0 rgba(93, 228, 199, 0)' },
                { backgroundColor: 'rgba(93, 228, 199, 0.13)', boxShadow: '0 0 0 1px rgba(93, 228, 199, 0.28)' },
                { backgroundColor: 'rgba(93, 228, 199, 0)', boxShadow: '0 0 0 0 rgba(93, 228, 199, 0)' }
            ],
            { duration: reduceMotion ? 1 : 1350, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
        )
        target.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
        return true
    }, [])
    const revealActivity = useCallback((activityId: string) => {
        if (revealActivityInDom(activityId)) return
        pendingActivityRevealRef.current = activityId
        timelineWindow.revealAll()
    }, [revealActivityInDom, timelineWindow])

    useLayoutEffect(() => {
        const pendingActivityId = pendingActivityRevealRef.current
        if (!pendingActivityId || !revealActivityInDom(pendingActivityId)) return
        pendingActivityRevealRef.current = null
    }, [revealActivityInDom, timelineWindow.loadedEntryCount])
    const entries = useAssistantTimelineEntries(
        messages,
        activities,
        proposedPlans,
        timelineWindow.loadedEntryCount
    )
    const visibleEntries = entries
    const baseRows = useMemo(
        () => buildTimelineRows(visibleEntries, isWorking, activeWorkStartedAt),
        [activeWorkStartedAt, isWorking, visibleEntries]
    )
    const rows = useMemo(
        () => groupTimelineRowsIntoWorkSummaries({
            rows: baseRows,
            messages,
            turnUsageById,
            latestAssistantMessageId,
            latestTurnStartedAt,
            isWorking
        }),
        [baseRows, isWorking, latestAssistantMessageId, latestTurnStartedAt, messages, turnUsageById]
    )
    const lastAssistantMessageIdByTurn = useMemo(() => {
        const next = new Map<string, string>()
        for (const message of messages) {
            if (message.role !== 'assistant' || !message.turnId) continue
            next.set(message.turnId, message.id)
        }
        return next
    }, [messages])
    const commandCheckpointTargetById = useMemo(() => new Map(
        activities
            .filter(isCommandCheckpointActivity)
            .map((activity) => [activity.id, findRelatedCommandActivityId(activity, activities)] as const)
    ), [activities])
    const runningCommandCount = useMemo(() => countRunningCommandActivities(activities), [activities])

    if (loadingChats) {
        return <TimelineChatLoadingState />
    }

    if (rows.length === 0) {
        return (
            <TimelineEmptyState
                projectLabel={projectLabel}
                projectTitle={projectTitle}
                sessionMode={sessionMode}
                showStatusIndicator={isConnecting || isWorking}
                statusIndicatorLabel={workingLabel}
            />
        )
    }

    const renderRow = (
        row: TimelineDisplayRow,
        options: { compactLiveNarration?: boolean; liveNarration?: boolean } = {}
    ): ReactNode => {
        if (row.kind === 'turn-work-summary') {
            return (
                <TimelineTurnWorkSummary
                    key={row.id}
                    startedAt={row.startedAt}
                    completedAt={row.completedAt}
                    running={row.running}
                    renderLiveNarration={row.liveNarrationRow
                        ? (expanded) => (
                            <div
                                data-assistant-live-narration="true"
                                data-display-mode="compact"
                                aria-hidden={expanded}
                                className={cn('pt-2', expanded && 'hidden')}
                            >
                                {renderRow(row.liveNarrationRow!, {
                                    compactLiveNarration: true,
                                    liveNarration: true
                                })}
                            </div>
                        )
                        : undefined}
                >
                    <div className="[&>*:last-child]:pb-0">
                        {row.rows.map((workRow) => renderRowContainer(workRow, renderRow(workRow)))}
                    </div>
                </TimelineTurnWorkSummary>
            )
        }
        if (row.kind === 'work-trace-group') {
            return (
                <TimelineWorkTraceGroup
                    key={row.id}
                    activities={row.activities}
                    targetActivityIdByCheckpointId={commandCheckpointTargetById}
                    onRevealCommand={revealActivity}
                />
            )
        }
        if (row.kind === 'thought-group') {
            return <TimelineThoughtGroup key={row.id} activities={row.activities} />
        }
        if (row.kind === 'command-checkpoint-group') {
            return (
                <TimelineCommandCheckpointGroup
                    key={row.id}
                    activities={row.activities}
                    targetActivityIdByCheckpointId={commandCheckpointTargetById}
                    onRevealCommand={revealActivity}
                />
            )
        }
        if (row.kind === 'activity-group') {
            if (row.activities.every((activity) => isIssueActivity(activity))) {
                return (
                    <TimelineIssueList
                        key={row.id}
                        activities={row.activities}
                    />
                )
            }
            return (
                <TimelineToolCallList
                    key={row.id}
                    activities={row.activities}
                    runningCommandCount={runningCommandCount}
                    projectRootPath={projectRootPath}
                    toolOutputDefaultMode={assistantToolOutputDefaultMode}
                    onOpenFilePath={onOpenFilePath}
                    onViewDiff={onViewDiff}
                />
            )
        }
        if (row.kind === 'activity') {
            if (isInternalAssistantActivity(row.activity)) {
                return <TimelineThought key={row.id} activity={row.activity} />
            }
            if (isModelNoticeActivity(row.activity)) {
                return <TimelineModelNotice key={row.id} activity={row.activity} />
            }
            if (isCommandCheckpointActivity(row.activity)) {
                return (
                    <TimelineCommandCheckpoint
                        key={row.id}
                        activity={row.activity}
                        targetActivityId={commandCheckpointTargetById.get(row.activity.id) || null}
                        onRevealCommand={commandCheckpointTargetById.get(row.activity.id)
                            ? () => revealActivity(commandCheckpointTargetById.get(row.activity.id)!)
                            : undefined}
                    />
                )
            }
            if (isContextCompactionActivity(row.activity)) {
                return (
                    <TimelineContextCompactionMarker
                        key={row.id}
                        activity={row.activity}
                    />
                )
            }
            if (isIssueActivity(row.activity)) {
                return (
                    <TimelineIssueList
                        key={row.id}
                        activities={[row.activity]}
                    />
                )
            }
            return (
                <TimelineToolCallList
                    key={row.id}
                    activities={[row.activity]}
                    runningCommandCount={runningCommandCount}
                    projectRootPath={projectRootPath}
                    toolOutputDefaultMode={assistantToolOutputDefaultMode}
                    onOpenFilePath={onOpenFilePath}
                    onViewDiff={onViewDiff}
                />
            )
        }
        if (row.kind === 'working') {
            return <TimelineWorkingIndicator key={row.id} startedAt={activeWorkStartedAt} label={workingLabel} />
        }
        if (row.kind === 'plan') {
            return (
                <TimelineProposedPlan
                    key={row.id}
                    plan={row.plan}
                    canImplement={row.canImplement && !isWorking}
                    onImplement={onImplementProposedPlan}
                    onShowPlanPanel={onShowPlanPanel}
                    scrollContainerRef={scrollContainerRef}
                    overlayContainerRef={overlayContainerRef}
                    filePath={assistantMessageFilePath}
                    onInternalLinkClick={onOpenInternalLink}
                />
            )
        }
        return (
            <TimelineMessage
                key={options.liveNarration ? 'active-live-narration' : row.id}
                message={row.message}
                isLatestAssistant={row.message.role === 'assistant' && row.message.id === latestAssistantMessageId}
                isLastAssistantInTurn={row.message.role === 'assistant' && !!row.message.turnId && lastAssistantMessageIdByTurn.get(row.message.turnId) === row.message.id}
                latestTurnStartedAt={latestTurnStartedAt}
                turnUsage={row.message.role === 'assistant' && row.message.turnId ? (turnUsageById?.get(row.message.turnId) || null) : null}
                deleting={row.message.id === deletingMessageId}
                assistantTextStreamingMode={assistantTextStreamingMode}
                compactLiveNarration={options.compactLiveNarration}
                onRequestDelete={row.message.role === 'user' ? onRequestDeleteUserMessage : undefined}
                onOpenFilePath={row.message.role === 'user' ? onOpenFilePath : undefined}
                filePath={row.message.role === 'assistant' ? assistantMessageFilePath : null}
                onInternalLinkClick={row.message.role === 'assistant' ? onOpenInternalLink : undefined}
                onOpenAttachmentPreview={row.message.role === 'user' ? onOpenAttachmentPreview : undefined}
            />
        )
    }

    const renderRowContainer = (row: TimelineDisplayRow, content: ReactNode) => {
        if (!content) return null
        return (
            <div
                key={row.id}
                id={row.kind === 'message' ? getTimelineMessageDomId(row.message.id) : undefined}
                className="pb-4"
                data-assistant-timeline-row-id={row.id}
                data-assistant-timeline-row-kind={row.kind}
                data-assistant-message-role={row.kind === 'message' ? row.message.role : undefined}
            >
                {content}
            </div>
        )
    }

    return (
        <div ref={timelineRootRef} className="relative">
            <AssistantTimelineCheckpointRail
                rows={baseRows}
                rootRef={timelineRootRef}
                railHostRef={railHostRef}
                scrollContainerRef={scrollContainerRef}
                turnUsageById={turnUsageById}
                latestTurnStartedAt={latestTurnStartedAt}
            />
            {rows.map((row) => renderRowContainer(row, renderRow(row)))}
        </div>
    )
}

export const AssistantTimeline = memo(AssistantTimelineImpl)
