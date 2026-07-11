import type {
    AssistantAttachSessionToPlaygroundLabInput,
    AssistantApprovePendingPlaygroundLabRequestInput,
    AssistantCreatePlaygroundLabInput,
    AssistantDeclinePendingPlaygroundLabRequestInput,
    AssistantDeletePlaygroundLabInput
} from '../../shared/assistant/contracts'
import {
    createPlaygroundLabRecord,
    ensurePlaygroundLabExists
} from './playground-service'
import type { AssistantServiceActionDeps } from './service-action-deps'
import { ensureAssistantSessionSelectionAfterDeletion } from './service-session-delete-fallback'
import { getActiveThread, requireActiveThread, requireSession } from './service-state'
import { sessionReferencesPlaygroundLab, threadUsesPlaygroundLabPath } from './session-mutation-utils'
import { createAssistantId, nowIso, sanitizeOptionalPath } from './utils'

export async function setPlaygroundRootAction(deps: AssistantServiceActionDeps, input: { rootPath: string | null }) {
    await deps.ensureReady()
    const rootPath = sanitizeOptionalPath(input.rootPath)
    deps.appendEvent('playground.updated', nowIso(), {
        playground: {
            ...deps.getSnapshot().playground,
            rootPath
        }
    })
    return { success: true as const, playground: structuredClone(deps.getSnapshot().playground) }
}

export async function createPlaygroundLabAction(deps: AssistantServiceActionDeps, input: AssistantCreatePlaygroundLabInput) {
    await deps.ensureReady()
    const rootPath = deps.getSnapshot().playground.rootPath
    if (!rootPath) throw new Error('Choose a Playground root first.')

    const existingFolderPath = sanitizeOptionalPath(input.existingFolderPath)?.toLowerCase() || null
    if (input.source === 'existing-folder' && existingFolderPath) {
        const existingLab = deps.getSnapshot().playground.labs.find((lab) => (sanitizeOptionalPath(lab.rootPath)?.toLowerCase() || null) === existingFolderPath) || null
        if (existingLab) {
            let sessionId: string | null = null
            if (input.openSession) {
                const created = await deps.createSession({
                    mode: 'work',
                    projectPath: existingLab.rootPath
                })
                sessionId = created.sessionId
            }
            return {
                success: true as const,
                labId: existingLab.id,
                sessionId,
                playground: structuredClone(deps.getSnapshot().playground)
            }
        }
    }

    const lab = await createPlaygroundLabRecord({
        rootPath,
        title: input.title,
        source: input.source,
        repoUrl: input.repoUrl,
        existingFolderPath: input.existingFolderPath
    })
    const nextPlayground = {
        ...deps.getSnapshot().playground,
        labs: [lab, ...deps.getSnapshot().playground.labs]
    }
    const occurredAt = nowIso()
    deps.appendEvent('playground.updated', occurredAt, { playground: nextPlayground })

    let sessionId: string | null = null
    if (input.openSession) {
        const created = await deps.createSession({
            mode: 'work',
            projectPath: lab.rootPath
        })
        sessionId = created.sessionId
    }

    return {
        success: true as const,
        labId: lab.id,
        sessionId,
        playground: structuredClone(deps.getSnapshot().playground)
    }
}

export async function deletePlaygroundLabAction(deps: AssistantServiceActionDeps, input: AssistantDeletePlaygroundLabInput) {
    await deps.ensureReady()
    const lab = ensurePlaygroundLabExists(deps.getSnapshot().playground.labs, input.labId)
    const occurredAt = nowIso()
    const affectedSessions = deps.getSnapshot().sessions.filter((session) => sessionReferencesPlaygroundLab(session, lab.rootPath, lab.id))
    let deletedSessionForFallback = null as typeof affectedSessions[number] | null

    for (const session of affectedSessions) {
        const activeThread = getActiveThread(session)
        if (activeThread) {
            deps.runtime.disconnect(activeThread.providerThreadId || activeThread.id)
        }

        const hasMessages = session.threads.some((thread) => (thread.messageCount || thread.messages.length) > 0)
        if (!hasMessages) {
            deps.appendEvent('session.deleted', occurredAt, { sessionId: session.id }, session.id)
            deletedSessionForFallback = session
            continue
        }

        deps.appendEvent('session.updated', occurredAt, {
            sessionId: session.id,
            patch: {
                mode: 'work',
                projectPath: sanitizeOptionalPath(session.projectPath) || lab.rootPath,
                playgroundLabId: null,
                pendingLabRequest: null,
                updatedAt: occurredAt
            }
        }, session.id, session.activeThreadId || undefined)

        for (const thread of session.threads) {
            const shouldClearThreadPath = session.playgroundLabId === lab.id || threadUsesPlaygroundLabPath(thread, lab.rootPath)
            if (!shouldClearThreadPath || !thread.cwd) continue
            deps.appendEvent('thread.updated', occurredAt, {
                threadId: thread.id,
                patch: {
                    cwd: null,
                    updatedAt: occurredAt
                }
            }, session.id, thread.id)
        }
    }

    deps.appendEvent('playground.updated', occurredAt, {
        playground: {
            ...deps.getSnapshot().playground,
            labs: deps.getSnapshot().playground.labs.filter((entry) => entry.id !== lab.id)
        }
    })

    if (deletedSessionForFallback) {
        await ensureAssistantSessionSelectionAfterDeletion(deps, deletedSessionForFallback, {
            replacementInput: {
                mode: 'work'
            }
        })
    }

    return { success: true as const, playground: structuredClone(deps.getSnapshot().playground) }
}

export async function attachSessionToPlaygroundLabAction(
    deps: AssistantServiceActionDeps,
    input: AssistantAttachSessionToPlaygroundLabInput
) {
    await deps.ensureReady()
    const session = requireSession(deps.getSnapshot(), input.sessionId)
    const lab = ensurePlaygroundLabExists(deps.getSnapshot().playground.labs, input.labId)
    deps.appendEvent('session.updated', nowIso(), {
        sessionId: session.id,
        patch: {
            mode: 'work',
            projectPath: lab.rootPath,
            playgroundLabId: null,
            pendingLabRequest: null,
            updatedAt: nowIso()
        }
    }, session.id, session.activeThreadId || undefined)
    return { success: true as const, playground: structuredClone(deps.getSnapshot().playground) }
}

export async function approvePendingPlaygroundLabRequestAction(
    deps: AssistantServiceActionDeps,
    input: AssistantApprovePendingPlaygroundLabRequestInput
) {
    await deps.ensureReady()
    const session = requireSession(deps.getSnapshot(), input.sessionId)
    const pendingLabRequest = session.pendingLabRequest
    if (!pendingLabRequest) throw new Error('There is no pending Playground lab request for this chat.')

    const result = await deps.createPlaygroundLab({
        title: input.title || pendingLabRequest.suggestedLabName,
        source: input.source,
        repoUrl: input.repoUrl || pendingLabRequest.repoUrl || undefined,
        openSession: false
    })
    const lab = ensurePlaygroundLabExists(deps.getSnapshot().playground.labs, result.labId)
    deps.appendEvent('session.updated', nowIso(), {
        sessionId: session.id,
        patch: {
            mode: 'work',
            projectPath: lab.rootPath,
            playgroundLabId: null,
            pendingLabRequest: null,
            updatedAt: nowIso()
        }
    }, session.id, session.activeThreadId || undefined)
    await deps.sendPrompt(pendingLabRequest.prompt, { sessionId: session.id })
    return {
        success: true as const,
        sessionId: session.id,
        labId: lab.id,
        playground: structuredClone(deps.getSnapshot().playground)
    }
}

export async function declinePendingPlaygroundLabRequestAction(
    deps: AssistantServiceActionDeps,
    input: AssistantDeclinePendingPlaygroundLabRequestInput
) {
    await deps.ensureReady()
    const session = requireSession(deps.getSnapshot(), input.sessionId)
    if (!session.pendingLabRequest) return { success: true as const }
    const thread = requireActiveThread(session)
    const occurredAt = nowIso()
    deps.appendEvent('session.updated', occurredAt, {
        sessionId: session.id,
        patch: {
            pendingLabRequest: null,
            updatedAt: occurredAt
        }
    }, session.id, thread.id)
    deps.appendEvent('thread.activity.appended', occurredAt, {
        threadId: thread.id,
        activity: {
            id: createAssistantId('assistant-activity'),
            kind: 'playground.lab-request.declined',
            tone: 'warning',
            summary: 'Playground lab request declined',
            detail: 'The assistant cannot continue filesystem work for this Playground chat without a lab.',
            turnId: null,
            createdAt: occurredAt
        }
    }, session.id, thread.id)
    return { success: true as const }
}
