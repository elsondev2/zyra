import { memo, useMemo } from 'react'
import { FolderTree } from 'lucide-react'
import { PreviewNavigationSidebar, type PreviewNavigationWorkspaceState } from '@/components/ui/file-preview/PreviewNavigationSidebar'
import type { PreviewFile, PreviewOpenOptions } from '@/components/ui/file-preview/types'

function getProjectName(projectPath: string): string {
    const normalizedPath = projectPath.replace(/[\\/]+$/, '')
    return normalizedPath.split(/[\\/]/).filter(Boolean).pop() || 'Workspace'
}

export const AssistantExplorerWorkspace = memo(function AssistantExplorerWorkspace({
    projectPath,
    onOpenPreview,
    onOpenPreviewInNewTab,
    initialWorkspaceState,
    onWorkspaceStateChange
}: {
    projectPath: string | null
    onOpenPreview: (file: { name: string; path: string }, ext: string, options?: PreviewOpenOptions) => Promise<void>
    onOpenPreviewInNewTab: (file: { name: string; path: string }, ext: string, options?: PreviewOpenOptions) => Promise<void>
    initialWorkspaceState?: PreviewNavigationWorkspaceState
    onWorkspaceStateChange?: (state: PreviewNavigationWorkspaceState) => void
}) {
    const normalizedProjectPath = String(projectPath || '').trim()
    const rootFile = useMemo<PreviewFile | null>(() => normalizedProjectPath ? {
        name: getProjectName(normalizedProjectPath),
        path: normalizedProjectPath,
        type: 'directory'
    } : null, [normalizedProjectPath])

    if (!rootFile) {
        return (
            <section
                className="flex min-h-0 flex-1 items-center justify-center bg-[color-mix(in_srgb,var(--color-bg)_94%,black)] px-6 text-center"
                aria-label="Explorer workspace"
            >
                <div className="max-w-[250px] text-sparkle-text-muted/60">
                    <FolderTree size={18} className="mx-auto" />
                    <h3 className="mt-2.5 text-[12px] font-medium text-sparkle-text-secondary">No project attached</h3>
                    <p className="mt-1 text-[10px] leading-4">Choose a project for this chat to browse its files.</p>
                </div>
            </section>
        )
    }

    return (
        <section className="flex min-h-0 flex-1 overflow-hidden" aria-label="Explorer workspace">
            <PreviewNavigationSidebar
                key={normalizedProjectPath}
                file={rootFile}
                projectPath={normalizedProjectPath}
                onOpenLinkedPreview={onOpenPreview}
                onOpenLinkedPreviewInNewTab={onOpenPreviewInNewTab}
                variant="workspace"
                initialWorkspaceState={initialWorkspaceState}
                onWorkspaceStateChange={onWorkspaceStateChange}
            />
        </section>
    )
})
