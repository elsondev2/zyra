import type { AssistantActivePlan, AssistantLatestTurn, AssistantProposedPlan } from '@shared/assistant/contracts'
import { useAssistantStoreSelector } from '@/lib/assistant/store'
import { getActiveAssistantThread, getAssistantLatestProposedPlan, getSelectedAssistantSession } from '@/lib/assistant/selectors'
import { getAssistantLinkBaseFilePath } from './assistant-file-navigation'
import { resolveSessionProjectPath } from './assistant-sessions-rail-utils'
import { AssistantPlanPanel } from './AssistantPlanPanel'

type PlanPanelSelection = {
    activePlan: AssistantActivePlan | null
    latestTurn: AssistantLatestTurn | null
    latestProposedPlan: AssistantProposedPlan | null
    markdownFilePath: string | null
}

const CLOSED_PLAN_PANEL_SELECTION: PlanPanelSelection = {
    activePlan: null,
    latestTurn: null,
    latestProposedPlan: null,
    markdownFilePath: null
}

function areLatestTurnsEqual(left: AssistantLatestTurn | null, right: AssistantLatestTurn | null): boolean {
    if (left === right) return true
    if (!left || !right) return left === right
    return left.id === right.id
        && left.state === right.state
        && left.requestedAt === right.requestedAt
        && left.startedAt === right.startedAt
        && left.completedAt === right.completedAt
        && left.assistantMessageId === right.assistantMessageId
        && left.effort === right.effort
        && left.serviceTier === right.serviceTier
}

function areActivePlansEqual(left: AssistantActivePlan | null, right: AssistantActivePlan | null): boolean {
    if (left === right) return true
    if (!left || !right) return left === right
    return left.turnId === right.turnId
        && left.updatedAt === right.updatedAt
        && left.explanation === right.explanation
        && left.plan.length === right.plan.length
}

function areProposedPlansEqual(left: AssistantProposedPlan | null, right: AssistantProposedPlan | null): boolean {
    if (left === right) return true
    if (!left || !right) return left === right
    return left.id === right.id
        && left.turnId === right.turnId
        && left.updatedAt === right.updatedAt
        && left.planMarkdown === right.planMarkdown
}

function arePlanPanelSelectionsEqual(left: PlanPanelSelection, right: PlanPanelSelection): boolean {
    return left.markdownFilePath === right.markdownFilePath
        && areActivePlansEqual(left.activePlan, right.activePlan)
        && areLatestTurnsEqual(left.latestTurn, right.latestTurn)
        && areProposedPlansEqual(left.latestProposedPlan, right.latestProposedPlan)
}

export function ConnectedAssistantPlanPanel(props: {
    open: boolean
    compact?: boolean
    onClose: () => void
    onShowThreadDetails: () => void
    onOpenInternalLink?: (href: string) => Promise<void> | void
}) {
    const selection = useAssistantStoreSelector<PlanPanelSelection>((state) => {
        if (!props.open) return CLOSED_PLAN_PANEL_SELECTION

        const selectedSession = getSelectedAssistantSession(state.snapshot)
        const activeThread = getActiveAssistantThread(selectedSession)
        const selectedProjectPath = selectedSession ? resolveSessionProjectPath(selectedSession) : ''

        return {
            activePlan: activeThread?.activePlan || null,
            latestTurn: activeThread?.latestTurn || null,
            latestProposedPlan: getAssistantLatestProposedPlan(activeThread),
            markdownFilePath: getAssistantLinkBaseFilePath(selectedProjectPath) || null
        }
    }, arePlanPanelSelectionsEqual)

    return (
        <AssistantPlanPanel
            open={props.open}
            compact={props.compact}
            activePlan={selection.activePlan}
            latestTurn={selection.latestTurn}
            latestProposedPlan={selection.latestProposedPlan}
            markdownFilePath={selection.markdownFilePath}
            onClose={props.onClose}
            onShowThreadDetails={props.onShowThreadDetails}
            onOpenInternalLink={props.onOpenInternalLink}
        />
    )
}
