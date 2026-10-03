import type { AssistantProject } from '@shared/assistant/contracts'

export function getNewChatProjectUnavailableReason(input: {
    hasSession: boolean
    isDraft: boolean
    projectLocked: boolean
    commandPending: boolean
    catalogLoading: boolean
}): string | null {
    if (!input.hasSession) return 'This chat is still opening. Try again in a moment.'
    if (!input.isDraft) return 'This chat has started. Change its project from the chat header.'
    if (input.projectLocked) return 'Finish or stop the active chat work before changing projects.'
    if (input.commandPending) return 'Finish the current chat action before changing projects.'
    if (input.catalogLoading) return 'Projects are still loading. Try again in a moment.'
    return null
}

export function getOptimisticProjectWorkingRoot(project: AssistantProject): string {
    return project.folders.find((folder) => folder.available && folder.access === 'read-write')?.path
        || project.homePath
}

type ProjectSaveResult = { success: true } | { success: false; error: string }

export async function runLatestProjectSave<Selection extends object>(input: {
    getLatest: () => Selection | null
    save: (selection: Selection) => Promise<ProjectSaveResult>
    settle: (selection: Selection, result: ProjectSaveResult) => void
}): Promise<void> {
    while (true) {
        const selection = input.getLatest()
        if (!selection) return
        let result: ProjectSaveResult
        try {
            result = await input.save(selection)
        } catch (error) {
            result = { success: false, error: error instanceof Error ? error.message : 'Unknown error.' }
        }
        if (input.getLatest() !== selection) continue
        input.settle(selection, result)
        return
    }
}
