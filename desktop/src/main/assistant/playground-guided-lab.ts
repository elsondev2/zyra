import type { AssistantPendingUserInput, AssistantSession } from '../../shared/assistant/contracts'
import { parseSerializedAssistantMessage } from '../../shared/assistant/message-attachments'
import {
    PLAYGROUND_TERMINAL_ACCESS_APPROVE_OPTION,
    PLAYGROUND_TERMINAL_ACCESS_DECISION_QUESTION_ID,
    PLAYGROUND_TERMINAL_ACCESS_DECLINE_OPTION
} from '../../shared/assistant/playground-terminal-access'
import { sanitizeOptionalPath } from './utils'

export const PLAYGROUND_LAB_DECISION_QUESTION_ID = 'playground_lab_decision'
export const PLAYGROUND_LAB_NAME_QUESTION_ID = 'playground_lab_name'
export const PLAYGROUND_REPO_URL_QUESTION_ID = 'playground_repo_url'

type PlaygroundLabDecision = 'continue-without-lab' | 'create-empty' | 'clone-repo'

const WORKSPACE_BUILD_PATTERN = /\b(create|build|make|scaffold|generate|implement|code|repo|repository|project|app|workspace|files?)\b/i
const REPOSITORY_CLONE_PATTERN = /\b(clone|fork|checkout|pull)\b.*\b(repo|repository|github|gitlab|bitbucket)\b|\b(repo|repository|github|gitlab|bitbucket)\b.*\b(clone|fork|checkout|pull)\b/i
const TERMINAL_ACCESS_PATTERN = /\b(terminal|shell|command|commands|run|execute|exec|install|npm|pnpm|yarn|bun|node|python|powershell|cmd|git status|git diff|ls|dir)\b/i
const LOCAL_ASSET_REFERENCE_PATTERN = /\b(folder|directory|path|drive|downloads?|desktop|documents?|videos?|recordings?|screen recordings?|screenshots?|frames?|mp4|mov|mkv|webm|avi|png|jpe?g|gif|wav|mp3)\b/i
const LOCAL_ACCESS_ACTION_PATTERN = /\b(open|look|inspect|read|analy[sz]e|extract|get|show|tell|find|use|load|view)\b/i

export function isPlaygroundNoLabSession(session: AssistantSession): boolean {
    return session.mode === 'playground'
        && !session.playgroundLabId
        && !sanitizeOptionalPath(session.projectPath)
}

export function shouldUsePlaygroundLabSetupPrompt(prompt: string): boolean {
    const normalizedPrompt = parseSerializedAssistantMessage(prompt).body.trim()
    if (!normalizedPrompt) return false

    const hasRepoUrl = /https?:\/\/[^\s]+(?:\.git)?/i.test(normalizedPrompt)
    const referencesLocalAsset = LOCAL_ASSET_REFERENCE_PATTERN.test(normalizedPrompt)
    return hasRepoUrl
        || WORKSPACE_BUILD_PATTERN.test(normalizedPrompt)
        || (referencesLocalAsset && (
            LOCAL_ACCESS_ACTION_PATTERN.test(normalizedPrompt)
            || /\b(my|this|that|these|those|there|here|inside|in)\b/i.test(normalizedPrompt)
        ))
}

export function shouldUsePlaygroundTerminalAccessPrompt(prompt: string): boolean {
    const normalizedPrompt = parseSerializedAssistantMessage(prompt).body.trim()
    if (!normalizedPrompt) return false

    const referencesLocalAsset = LOCAL_ASSET_REFERENCE_PATTERN.test(normalizedPrompt)
    return TERMINAL_ACCESS_PATTERN.test(normalizedPrompt)
        || (referencesLocalAsset && (
            LOCAL_ACCESS_ACTION_PATTERN.test(normalizedPrompt)
            || /\b(my|this|that|these|those|there|here|inside|in)\b/i.test(normalizedPrompt)
        ))
}

export function buildPlaygroundTerminalAccessRuntimePrompt(prompt: string): string {
    const normalizedPrompt = String(prompt || '').trim()
    if (!normalizedPrompt) return prompt
    return [
        '[Zyra Playground context]',
        'This chat is in Playground mode and does not currently have a lab attached.',
        'Terminal access is disabled for this chat-only Playground session.',
        'You may not run shell, filesystem, or local workspace tools unless the user grants terminal access.',
        'If terminal/filesystem access is needed or materially useful for the request, ask for terminal access now.',
        `Use request_user_input with question id "${PLAYGROUND_TERMINAL_ACCESS_DECISION_QUESTION_ID}" for the terminal-access decision.`,
        'The question text must include a concise reason for terminal access and must mention that access uses a neutral home-directory cwd, not a specific project folder.',
        `Use "${PLAYGROUND_TERMINAL_ACCESS_APPROVE_OPTION}" as the allow option label.`,
        `Use "${PLAYGROUND_TERMINAL_ACCESS_DECLINE_OPTION}" as the continue-without-terminal option label.`,
        'Do not request a Playground lab in this terminal-access request.',
        '',
        normalizedPrompt
    ].join('\n')
}

export function buildPlaygroundNoLabRuntimePrompt(
    prompt: string,
    options?: { labSetupDeclined?: boolean; terminalAccess?: boolean; terminalAccessRequestSuppressed?: boolean }
): string {
    const normalizedPrompt = String(prompt || '').trim()
    if (!normalizedPrompt) return prompt
    const userPromptBody = parseSerializedAssistantMessage(normalizedPrompt).body.trim()
    const labSetupDeclined = options?.labSetupDeclined === true
    const terminalAccess = options?.terminalAccess === true
    const terminalAccessRequestSuppressed = options?.terminalAccessRequestSuppressed === true
    const canRequestLabSetup = !labSetupDeclined && !terminalAccessRequestSuppressed
    const shouldOfferClone = shouldOfferRepositoryClone(userPromptBody)
    if (terminalAccess) {
        return [
            '[Zyra Playground context]',
            'This chat is in Playground mode and does not currently have a lab attached.',
            'Terminal access is enabled for this chat-only Playground session.',
            'You may use shell and filesystem tools from the neutral home-directory cwd.',
            'There is still no attached repo, project tree, or Playground lab.',
            'Do not infer a project root. Use explicit paths for local filesystem work outside the cwd.',
            'If the user asks to create files but does not name a target folder, ask one concise location question instead of creating a lab automatically.',
            '',
            normalizedPrompt
        ].join('\n')
    }
    return [
        '[Zyra Playground context]',
        'This chat is in Playground mode and does not currently have a lab attached.',
        'Treat this as a no-filesystem workspace by default, even if a temporary runtime cwd exists.',
        terminalAccessRequestSuppressed
            ? 'Terminal access is disabled and the user chose not to be asked again. Do not request terminal access for this prompt.'
            : 'Terminal access is disabled for this chat-only Playground session.',
        'Do not assume there is a repo, project tree, or editable codebase yet.',
        'If you can still answer usefully without filesystem access, do so directly.',
        labSetupDeclined
            ? 'The user declined lab setup for this request. Do not call request_user_input for this prompt. Answer without filesystem access and state any limitation briefly.'
            : terminalAccessRequestSuppressed
            ? 'Do not call request_user_input for terminal or shell access. Answer without filesystem access and state any limitation briefly.'
            : 'If the user asks for local file, folder, repo, app, code, shell, or workspace work, do not do filesystem or shell work yet.',
        canRequestLabSetup ? 'In that case, request user input instead of replying with a hard stop.' : null,
        canRequestLabSetup ? `Use request_user_input with question id "${PLAYGROUND_LAB_DECISION_QUESTION_ID}" for the lab decision.` : null,
        canRequestLabSetup ? `Use question id "${PLAYGROUND_LAB_NAME_QUESTION_ID}" for the suggested lab title.` : null,
        canRequestLabSetup && shouldOfferClone ? `Use question id "${PLAYGROUND_REPO_URL_QUESTION_ID}" only when cloning a repo and the URL is missing or should be confirmed.` : null,
        canRequestLabSetup ? 'The lab decision question must include a concise reason and the suggested lab title in the question text.' : null,
        canRequestLabSetup ? 'Decision options must include create an empty lab and continue without a lab.' : null,
        canRequestLabSetup && shouldOfferClone ? 'Only because the user asked for a repository/clone flow or provided a repo URL, include a clone repository option.' : null,
        canRequestLabSetup && !shouldOfferClone ? 'Do not include a clone repository option for ordinary new-app/workspace creation.' : null,
        canRequestLabSetup ? 'For the title question, put your suggested lab title as the first option label so the user can accept or replace it.' : null,
        canRequestLabSetup ? 'If the user continues without a lab, answer the original request as usefully as possible in normal chat without filesystem access and do not retry the same lab request immediately.' : null,
        '',
        normalizedPrompt
    ].filter((line): line is string => line !== null).join('\n')
}

function shouldOfferRepositoryClone(prompt: string): boolean {
    const normalizedPrompt = String(prompt || '').trim()
    return /https?:\/\/[^\s]+(?:\.git)?/i.test(normalizedPrompt)
        || REPOSITORY_CLONE_PATTERN.test(normalizedPrompt)
}

export function isPlaygroundLabUserInputRequest(pendingInput: AssistantPendingUserInput | null | undefined): boolean {
    if (!pendingInput) return false
    return pendingInput.questions.some((question) => question.id === PLAYGROUND_LAB_DECISION_QUESTION_ID)
}

export function isPlaygroundTerminalAccessUserInputRequest(pendingInput: AssistantPendingUserInput | null | undefined): boolean {
    if (!pendingInput) return false
    return pendingInput.questions.some((question) => question.id === PLAYGROUND_TERMINAL_ACCESS_DECISION_QUESTION_ID)
}

export function resolvePlaygroundLabGuidedAnswers(answers: Record<string, string | string[]>): {
    decision: PlaygroundLabDecision
    title?: string
    repoUrl?: string
} | null {
    const decisionAnswer = normalizeSingleAnswer(answers[PLAYGROUND_LAB_DECISION_QUESTION_ID])
    if (!decisionAnswer) return null

    const decision = parsePlaygroundLabDecision(decisionAnswer)
    if (!decision) return null

    const title = normalizeOptionalField(answers[PLAYGROUND_LAB_NAME_QUESTION_ID])
    const repoUrl = normalizeOptionalField(answers[PLAYGROUND_REPO_URL_QUESTION_ID])
    if (decision === 'clone-repo' && !looksLikeRepositoryUrl(repoUrl)) return null

    return {
        decision,
        title,
        repoUrl: decision === 'clone-repo' ? repoUrl : undefined
    }
}

export function resolvePlaygroundTerminalAccessAnswer(answers: Record<string, string | string[]>): {
    enabled: boolean
} | null {
    const decisionAnswer = normalizeSingleAnswer(answers[PLAYGROUND_TERMINAL_ACCESS_DECISION_QUESTION_ID])
    if (!decisionAnswer) return null

    const normalized = decisionAnswer.toLowerCase()
    if (normalized.includes(PLAYGROUND_TERMINAL_ACCESS_APPROVE_OPTION) || /\b(allow|enable|grant|approve|yes|terminal on)\b/.test(normalized)) {
        return { enabled: true }
    }
    if (normalized.includes(PLAYGROUND_TERMINAL_ACCESS_DECLINE_OPTION) || /\b(decline|without|no|skip|continue)\b/.test(normalized)) {
        return { enabled: false }
    }
    return null
}

export function buildPlaygroundTerminalAccessContinuationAnswer(enabled: boolean): string {
    return enabled
        ? 'Terminal access approved. Continue the original request with shell and filesystem access from the neutral home-directory cwd.'
        : 'Terminal access declined. Continue without terminal or filesystem access and answer the original request as normal.'
}

export function buildPlaygroundLabContinuationAnswer(reason: string): string {
    const normalizedReason = String(reason || '').trim()
    if (!normalizedReason) {
        return 'Continue without a lab. Stay in the no-lab Playground environment and avoid assuming filesystem access.'
    }
    return `${normalizedReason}. Stay in the no-lab Playground environment and avoid assuming filesystem access.`
}

export function buildPlaygroundLabCreatedAnswer(input: {
    decision: Exclude<PlaygroundLabDecision, 'continue-without-lab'>
    rootPath: string
    title?: string
    repoUrl?: string
}): string {
    const location = `Lab ready at ${input.rootPath}.`
    if (input.decision === 'clone-repo') {
        return [
            input.repoUrl ? `Clone approved for ${input.repoUrl}.` : 'Repository clone approved.',
            input.title ? `Use the lab "${input.title}".` : null,
            location,
            'For this turn, use that path explicitly as the working directory for filesystem or shell actions.'
        ].filter(Boolean).join(' ')
    }

    return [
        'Create-empty-lab approved.',
        input.title ? `Use the lab "${input.title}".` : null,
        location,
        'For this turn, use that path explicitly as the working directory for filesystem or shell actions.'
    ].filter(Boolean).join(' ')
}

function normalizeSingleAnswer(value: string | string[] | undefined): string {
    if (Array.isArray(value)) return String(value[0] || '').trim()
    return String(value || '').trim()
}

function normalizeOptionalField(value: string | string[] | undefined): string | undefined {
    const normalized = normalizeSingleAnswer(value)
    if (!normalized) return undefined
    const collapsed = normalized.toLowerCase()
    if (collapsed === 'none' || collapsed === 'n/a' || collapsed === 'na' || collapsed === 'skip') return undefined
    return normalized
}

function parsePlaygroundLabDecision(value: string): PlaygroundLabDecision | null {
    const normalized = value.toLowerCase()
    if (/\b(without|continue|no lab|no workspace|skip|decline)\b/.test(normalized)) return 'continue-without-lab'
    if (/\b(clone|repo|repository|git)\b/.test(normalized)) return 'clone-repo'
    if (/\b(create|empty|new lab|workspace|lab)\b/.test(normalized)) return 'create-empty'
    return null
}

function looksLikeRepositoryUrl(value: string | undefined): value is string {
    if (!value) return false
    return /^(https?:\/\/|git@|ssh:\/\/)/i.test(value)
}
