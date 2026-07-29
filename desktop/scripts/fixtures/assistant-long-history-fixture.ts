import type { AssistantActivity, AssistantMessage, AssistantProposedPlan, AssistantSession, AssistantSnapshot, AssistantThread } from '../../src/shared/assistant/contracts'
import { createDefaultSnapshot } from '../../src/main/assistant/projector'

const BASE_TIME = Date.parse('2026-07-16T08:00:00.000Z')
const iso = (sequence: number) => new Date(BASE_TIME + sequence * 10).toISOString()

export function createAssistantLongHistoryFixture(turnCount = 1000): AssistantSnapshot {
    const messages: AssistantMessage[] = []
    const activities: AssistantActivity[] = []
    const proposedPlans: AssistantProposedPlan[] = []
    let sequence = 1
    for (let turn = 1; turn <= turnCount; turn += 1) {
        const turnId = `fixture-turn-${turn}`
        const createdAt = iso(sequence)
        messages.push({
            id: `fixture-user-${turn}`,
            role: 'user',
            text: turn % 25 === 0 ? `Inspect fixture turn ${turn}.\n\n[attachment metadata: image-${turn}.png, image/png]` : `Inspect fixture turn ${turn}.`,
            turnId,
            streaming: false,
            timelineSequence: sequence++,
            createdAt,
            updatedAt: createdAt
        })
        for (let activityIndex = 0; activityIndex < 4; activityIndex += 1) {
            activities.push({
                id: `fixture-activity-${turn}-${activityIndex}`,
                kind: activityIndex === 3 ? 'file-change' : 'command',
                tone: 'tool',
                summary: `Fixture tool ${activityIndex + 1}`,
                detail: `fixture/${turn}/${activityIndex}`,
                turnId,
                timelineSequence: sequence++,
                createdAt: iso(sequence),
                payload: activityIndex === 3
                    ? { status: 'completed', paths: [`src/fixture-${turn}.ts`], patch: `--- a/src/fixture-${turn}.ts\n+++ b/src/fixture-${turn}.ts\n@@ -1 +1 @@\n-old\n+new\n` }
                    : { status: 'completed', command: `echo fixture-${turn}-${activityIndex}`, output: 'ok' }
            })
        }
        const assistantCreatedAt = iso(sequence)
        messages.push({
            id: `fixture-assistant-${turn}`,
            role: 'assistant',
            text: turn % 10 === 0
                ? `## Fixture result ${turn}\n\n\`\`\`ts\nexport const turn = ${turn}\n\`\`\`\n\n| Check | Result |\n| --- | --- |\n| fixture | pass |`
                : `Fixture result ${turn} completed.`,
            turnId,
            streaming: false,
            timelineSequence: sequence++,
            createdAt: assistantCreatedAt,
            updatedAt: assistantCreatedAt
        })
        if (turn % 50 === 0) {
            proposedPlans.push({ id: `fixture-plan-${turn}`, turnId, planMarkdown: `1. Inspect turn ${turn}\n2. Verify output`, timelineSequence: sequence++, createdAt: iso(sequence), updatedAt: iso(sequence) })
        }
    }

    const thread: AssistantThread = {
        id: 'fixture-long-thread', providerThreadId: null, source: 'root', parentThreadId: null, providerParentThreadId: null,
        subagentDepth: null, agentNickname: null, agentRole: null, model: 'fixture-model', cwd: 'C:/fixture',
        messageCount: messages.length, activityCount: activities.length, proposedPlanCount: proposedPlans.length,
        lastSeenCompletedTurnId: `fixture-turn-${turnCount}`, runtimeMode: 'approval-required', interactionMode: 'default', state: 'ready',
        lastError: null, createdAt: iso(0), updatedAt: iso(sequence), latestTurn: null,
        hasPendingApprovals: false, hasPendingUserInputs: false, hasActivePlan: false,
        activePlan: null, messages, activities, proposedPlans, pendingApprovals: [], pendingUserInputs: []
    }
    const session: AssistantSession = {
        id: 'fixture-long-session', title: 'Synthetic long history', mode: 'work', projectPath: 'C:/fixture', playgroundLabId: null,
        pendingLabRequest: null, archived: false, createdAt: iso(0), updatedAt: iso(sequence), activeThreadId: thread.id,
        threadIds: [thread.id], threads: [thread]
    }
    const snapshot = createDefaultSnapshot()
    snapshot.selectedSessionId = session.id
    snapshot.sessions = [session]
    return snapshot
}
