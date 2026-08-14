import type readline from 'node:readline'
import type {
    AssistantApprovalRequestType,
    AssistantInteractionMode,
    AssistantReasoningEffort,
    AssistantRuntimeMode,
    AssistantThread
} from '../../shared/assistant/contracts'
import {
    asRecord,
    asString,
    buildToolActivity,
    extractItemPaths,
    normalizeItemType,
    readNumericValue,
    readStringArray,
    readTextValue,
    readToolOutput,
    readToolTiming
} from './codex-runtime-value-utils'
import {
    isAssistantItemType as isAssistantItemTypeImpl,
    mapRuntimeMode as mapRuntimeModeImpl,
    readTurnUsage as readTurnUsageImpl,
    toApprovalRequestType as toApprovalRequestTypeImpl,
    toUserInputQuestions as toUserInputQuestionsImpl
} from './codex-runtime-session-utils'

export {
    asRecord,
    asString,
    buildToolActivity,
    extractItemPaths,
    normalizeItemType,
    readNumericValue,
    readStringArray,
    readTextValue,
    readToolOutput,
    readToolTiming
}

export type JsonRpcId = string | number
export type JsonRpcMessage = Record<string, unknown>

export interface PendingRpc {
    method: string
    timer: NodeJS.Timeout
    resolve: (value: unknown) => void
    reject: (error: Error) => void
}

export interface PendingApprovalRequest {
    requestId: string
    jsonRpcId: JsonRpcId
    requestType: AssistantApprovalRequestType
    threadId: string
    turnId?: string
    itemId?: string
}

export interface PendingUserInputRequest {
    requestId: string
    jsonRpcId: JsonRpcId
    threadId: string
    turnId?: string
    itemId?: string
}

export interface SessionContext {
    output: readline.Interface
    pending: Map<string, PendingRpc>
    pendingApprovals: Map<string, PendingApprovalRequest>
    pendingUserInputs: Map<string, PendingUserInputRequest>
    fileChangeRevisionByItemId: Map<string, number>
    nextRequestId: number
    stopping: boolean
    thread: AssistantThread
}

export function readTurnUsage(turn: Record<string, unknown> | undefined, payload: Record<string, unknown>) {
    return readTurnUsageImpl(turn, payload, readNumericValue, asRecord)
}

export function isAssistantItemType(itemType: string): boolean {
    return isAssistantItemTypeImpl(itemType)
}

export function toUserInputQuestions(value: unknown) {
    return toUserInputQuestionsImpl(value, asRecord, asString)
}

export function toApprovalRequestType(method: string) {
    return toApprovalRequestTypeImpl(method)
}

export function mapRuntimeMode(mode: AssistantRuntimeMode) {
    return mapRuntimeModeImpl(mode)
}

const CODEX_WINDOWS_SHELL_DEVELOPER_INSTRUCTIONS = `## Windows Shell Rules

You are running on Windows. When you use shell commands, treat PowerShell as the default shell unless you intentionally invoke a different shell.

- Do not use bash-style escaping such as \\" inside PowerShell command strings.
- Prefer single-quoted PowerShell strings or PowerShell here-strings when the command contains quotes, braces, colons, or regex.
- If a PowerShell command starts getting quote-heavy or nested, split it into smaller commands instead of forcing one fragile one-liner.
- For formatted output in PowerShell, prefer format expressions like ('=== {0} @ {1} ===' -f $id, $line) instead of embedded escaped quotes.
- Prefer PowerShell-native commands for Windows filesystem work. Do not compose bash pipelines unless you are explicitly running bash.
- Before sending a shell command, sanity-check that the command is valid for PowerShell syntax on Windows.
`

const CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS = `<collaboration_mode># Plan Mode (Conversational)

You work in 3 phases. Aim for a decision-complete final plan, but do not withhold a materially useful draft plan once enough information exists to produce one. When decisions remain open, keep them explicit and keep driving them to closure.

## Mode rules

You are in Plan Mode until a developer message explicitly ends it.

Plan Mode is not changed by user intent or imperative wording. If a user asks for execution while still in Plan Mode, treat it as a request to plan the execution, not perform it.

## Plan Mode vs update_plan tool

Plan Mode is a collaboration mode that can involve requesting user input and eventually issuing a <proposed_plan> block.

The update_plan tool is a separate checklist/progress tool. It does not enter or exit Plan Mode. Do not use update_plan while in Plan Mode.

## Execution boundaries

You may do non-mutating exploration that improves the plan. You must not do mutating work.

Allowed:

* reading and searching files, types, configs, and docs
* static analysis and repo exploration
* dry-run style checks that do not edit tracked files
* tests or checks that only write caches/build artifacts outside tracked files

Not allowed:

* editing or writing files
* applying patches, migrations, or codegen that changes tracked files
* formatters or linters that rewrite files
* side-effectful commands whose purpose is to carry out the plan

## Phase 1 - Explore first

Ground yourself in the actual environment before asking questions. Resolve all discoverable facts through non-mutating exploration first.

Before asking the user any question, perform at least one targeted exploration pass unless there is no local environment or the prompt itself is immediately contradictory.

Do not ask questions that can be answered from the repo or system.

## Phase 2 - Intent chat

Keep asking until the goal, success criteria, scope, constraints, audience, and key tradeoffs are clear.

If high-impact ambiguity remains and you cannot produce a credible draft plan yet, ask.

If you already have enough information for a credible draft implementation plan, produce that draft plan and clearly mark unresolved items instead of withholding the plan entirely.

## Phase 3 - Implementation chat

Once intent is stable, keep asking until the spec is decision complete: approach, interfaces, data flow, edge cases, failure modes, tests, rollout, and compatibility constraints.

## Asking questions

Strongly prefer using the request_user_input tool for questions.

Each question must materially change the plan, confirm an important assumption, or choose between meaningful tradeoffs. Do not ask questions that can be answered through exploration.

For preferences and tradeoffs, provide 2-4 mutually exclusive options and recommend one.

If the user has already entered a guided question flow, keep unresolved follow-up questions in that guided flow when possible. Prefer another request_user_input round over switching back to normal assistant prose.

Only ask unresolved questions in normal assistant text if the issue genuinely requires nuanced free-form explanation, longer context, or cannot be represented well in 1-3 short guided questions.

## Finalization

Output a <proposed_plan> block as soon as you have enough information for a credible implementation plan.

If the plan is not yet decision complete, still output the <proposed_plan> block and include a clearly labeled "Open decisions" section with recommended defaults and what still needs confirmation.

When the plan is decision complete, output the final <proposed_plan> block with no unresolved decisions left.

Wrap the plan in a <proposed_plan> block. Use Markdown inside the block. Include:

* a clear title
* a brief summary
* important public API or interface changes
* test cases and scenarios
* explicit assumptions and defaults
* an "Open decisions" section whenever anything remains unresolved

Only produce at most one <proposed_plan> block per turn.
</collaboration_mode>`

const CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS = `<collaboration_mode># Collaboration Mode: Default

You are now in Default mode. Any previous instructions for other modes are no longer active.

Your active mode changes only when new developer instructions with a different collaboration_mode change it. User requests do not change mode by themselves.

Do not call request_user_input in Default mode. Prefer making reasonable assumptions and executing the request. When a user decision is genuinely required, ask briefly in normal chat. If Playground lab setup is declined, answer normally without filesystem access instead of retrying the same lab request.
</collaboration_mode>`

function buildDeveloperInstructions(interactionMode: AssistantInteractionMode): string {
    const modeInstructions = interactionMode === 'plan'
        ? CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS
        : CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS

    if (process.platform !== 'win32') {
        return modeInstructions
    }

    return `${modeInstructions}\n\n${CODEX_WINDOWS_SHELL_DEVELOPER_INSTRUCTIONS}`
}

function buildCollaborationMode(
    interactionMode: AssistantInteractionMode,
    model: string | undefined,
    effort?: AssistantReasoningEffort
) {
    return {
        mode: interactionMode,
        settings: {
            ...(model ? { model } : {}),
            reasoning_effort: effort || 'medium',
            developer_instructions: buildDeveloperInstructions(interactionMode)
        }
    }
}

export function buildTurnParams(
    thread: AssistantThread,
    prompt: string,
    model?: string,
    runtimeMode?: AssistantRuntimeMode,
    interactionMode?: AssistantInteractionMode,
    effort?: AssistantReasoningEffort,
    serviceTier?: 'fast'
) {
    const effectiveModel = model || thread.model
    const effectiveInteractionMode = interactionMode || thread.interactionMode || 'default'
    const params: Record<string, unknown> = {
        threadId: thread.providerThreadId,
        input: [{ type: 'text', text: prompt }],
        approvalPolicy: mapRuntimeMode(runtimeMode || thread.runtimeMode).approvalPolicy,
        collaborationMode: buildCollaborationMode(effectiveInteractionMode, effectiveModel, effort)
    }
    if (effectiveModel) params['model'] = effectiveModel
    if (effort) params['effort'] = effort
    if (serviceTier) params['serviceTier'] = serviceTier
    return params
}
