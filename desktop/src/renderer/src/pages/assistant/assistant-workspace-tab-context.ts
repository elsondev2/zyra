import type {
    AssistantUtilityExplorerStateCapsule,
    AssistantUtilityStateCapsule,
    AssistantUtilityWorkspaceKind
} from '@shared/assistant/utility-window'

type ExplorerPreview = NonNullable<AssistantUtilityExplorerStateCapsule['activePreview']>

export type AssistantWorkspaceTabContext = {
    label: string
    preview: string
}

export function assistantWorkspaceFileName(filePath: string | null | undefined): string {
    const normalized = String(filePath || '').trim().replace(/\\/g, '/')
    return normalized.split('/').filter(Boolean).at(-1) || normalized
}

export function resolveFilesWorkspaceTabContext(
    activePreview: ExplorerPreview | undefined,
    projectPath: string | null
): AssistantWorkspaceTabContext {
    if (!activePreview) {
        return {
            label: 'Files',
            preview: projectPath ? `Browse ${projectPath}` : 'No project attached'
        }
    }
    const presentation = [
        'Files',
        activePreview.name,
        activePreview.mode === 'edit' ? 'Edit' : undefined,
        activePreview.expanded ? 'Full screen' : undefined
    ].filter(Boolean).join(' · ')
    return { label: activePreview.name, preview: presentation }
}

export function resolveDiffWorkspaceTabContext({
    turnCount,
    turnNumber,
    filePath
}: {
    turnCount: number
    turnNumber?: number
    filePath?: string
}): AssistantWorkspaceTabContext {
    const fileName = assistantWorkspaceFileName(filePath)
    if (!turnNumber && !fileName) {
        return {
            label: 'Diff',
            preview: `${turnCount} turns · Search prompts, responses, files, and turn numbers`
        }
    }
    return {
        label: fileName || `Turn ${turnNumber}`,
        preview: ['Diff', turnNumber ? `Turn ${turnNumber}` : undefined, filePath].filter(Boolean).join(' · ')
    }
}

export function resolveAssistantUtilityTabContextTitle(
    workspace: AssistantUtilityWorkspaceKind,
    capsule: AssistantUtilityStateCapsule | undefined,
    fallbackTitle: string
): string {
    if (workspace === 'explorer' && capsule?.workspace === 'explorer') {
        return capsule.activePreview?.name || 'Files'
    }
    if ((workspace === 'diff' || workspace === 'turn') && (capsule?.workspace === 'diff' || capsule?.workspace === 'turn')) {
        return assistantWorkspaceFileName(capsule.selectedDiff?.filePath) || fallbackTitle
    }
    return fallbackTitle
}
