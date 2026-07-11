import type { AssistantMessage, AssistantSession, AssistantThread } from '../../shared/assistant/contracts'
import {
    isAssistantProjectPathWithinRoot,
    normalizeAssistantProjectPathKey
} from '../../shared/assistant/session-routing'
import { shouldPersistAssistantSession } from './persistence-utils'
import { deriveSessionTitleFromPrompt, isDefaultSessionTitle } from './utils'

function getSortedUserMessages(threads: AssistantThread[]): AssistantMessage[] {
    return threads
        .flatMap((thread) => thread.messages)
        .filter((message) => message.role === 'user' && String(message.text || '').trim().length > 0)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
}

function getDerivedSessionTitleFromThreads(threads: AssistantThread[]): string | null {
    const firstUserMessage = getSortedUserMessages(threads)[0] || null
    if (!firstUserMessage) return null
    return deriveSessionTitleFromPrompt(firstUserMessage.text)
}

function shouldRetitleSessionAfterHistoryMutation(session: AssistantSession): boolean {
    if (isDefaultSessionTitle(session.title)) return true
    const currentDerivedTitle = getDerivedSessionTitleFromThreads(session.threads)
    return Boolean(currentDerivedTitle && session.title.trim() === currentDerivedTitle)
}

function isPathWithinLab(path: string | null | undefined, labRootPath: string): boolean {
    const pathKey = normalizeAssistantProjectPathKey(path)
    const labRootKey = normalizeAssistantProjectPathKey(labRootPath)
    return isAssistantProjectPathWithinRoot(pathKey, labRootKey)
}

export function buildSessionHistoryMutationResult(args: {
    session: AssistantSession
    mutatedThread: AssistantThread
}): {
    deleteSession: boolean
    patch: Partial<Pick<AssistantSession, 'title'>> | null
} {
    const { session, mutatedThread } = args
    const nextThreads = session.threads.map((thread) => (
        thread.id === mutatedThread.id
            ? mutatedThread
            : thread
    ))
    const nextSession: AssistantSession = {
        ...session,
        threads: nextThreads
    }

    if (!shouldPersistAssistantSession(nextSession)) {
        return { deleteSession: true, patch: null }
    }

    if (!shouldRetitleSessionAfterHistoryMutation(session)) {
        return { deleteSession: false, patch: null }
    }

    const nextTitle = getDerivedSessionTitleFromThreads(nextThreads) || 'New Session'
    if (nextTitle === session.title) {
        return { deleteSession: false, patch: null }
    }

    return {
        deleteSession: false,
        patch: { title: nextTitle }
    }
}

export function sessionReferencesPlaygroundLab(
    session: AssistantSession,
    labRootPath: string,
    labId?: string | null
): boolean {
    if (labId && session.playgroundLabId === labId) return true
    if (isPathWithinLab(session.projectPath, labRootPath)) return true
    return session.threads.some((thread) => isPathWithinLab(thread.cwd, labRootPath))
}

export function threadUsesPlaygroundLabPath(thread: AssistantThread, labRootPath: string): boolean {
    return isPathWithinLab(thread.cwd, labRootPath)
}
