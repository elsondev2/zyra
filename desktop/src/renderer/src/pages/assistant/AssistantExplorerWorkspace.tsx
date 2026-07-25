import { memo, useMemo } from 'react'
import { FolderTree } from 'lucide-react'
import { PreviewNavigationSidebar } from '@/components/ui/file-preview/PreviewNavigationSidebar'
import type { PreviewFile, PreviewOpenOptions } from '@/components/ui/file-preview/types'

function getProjectName(projectPath: string): string {
    const normalizedPath = projectPath.replace(/[\\/]+$/, '')
    return normalizedPath.split(/[\\/]/).filter(Boolean).pop() || 'Workspace'
}

export const AssistantExplorerWorkspace = memo(function AssistantExplorerWorkspace({
    projectPath,
    onOpenPreview,
    onOpenPreviewInNewTab
}: {
    projectPath: string | null
    onOpenPreview: (file: { name: string; path: string }, ext: string, options?: PreviewOpenOptions) => Promise<void>
    onOpenPreviewInNewTab: (file: { name: string; path: string }, ext: string, options?: PreviewOpenOptions) => Promise<void>
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
                <div className="max-w-[250px]">
                    <span className="mx-auto inline-flex size-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-sparkle-text-muted/55">
                        <FolderTree size={18} />
                    </span>
                    <h3 className="mt-3 text-[12px] font-semibold text-sparkle-text-secondary">No project attached</h3>
                    <p className="mt-1 text-[10px] leading-4 text-sparkle-text-muted/65">
                        Open a project chat to browse its files in this workspace.
                    </p>
                </div>
            </section>
        )
    }

    return (
        <section className="flex min-h-0 flex-1 overflow-hidden" aria-label="Explorer workspace">
            <PreviewNavigationSidebar
                file={rootFile}
                projectPath={normalizedProjectPath}
                onOpenLinkedPreview={onOpenPreview}
                onOpenLinkedPreviewInNewTab={onOpenPreviewInNewTab}
            />
        </section>
    )
})
