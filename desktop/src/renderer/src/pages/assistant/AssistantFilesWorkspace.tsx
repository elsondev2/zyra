import { Component, memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import type { AssistantUtilityExplorerStateCapsule } from '@shared/assistant/utility-window'
import FilePreviewModal from '@/components/ui/FilePreviewModal'
import { useFilePreview, type UseFilePreviewReturn } from '@/components/ui/file-preview/useFilePreview'
import type { PreviewNavigationWorkspaceState } from '@/components/ui/file-preview/PreviewNavigationSidebar'
import type { FilePreviewPresentationState } from '@/components/ui/file-preview/modalTypes'
import { AssistantExplorerWorkspace } from './AssistantExplorerWorkspace'
import { captureAssistantUtilityScrollAnchor, restoreAssistantUtilityScrollAnchor } from './assistant-utility-state-capsules'

export const AssistantFilesWorkspace = memo(function AssistantFilesWorkspace({
    projectPath,
    active = true,
    stateCapsule,
    onStateCapsuleChange,
    publishNavigatorToAppTitleBar = false
}: {
    projectPath: string | null
    active?: boolean
    stateCapsule?: AssistantUtilityExplorerStateCapsule
    onStateCapsuleChange?: (capsule: AssistantUtilityExplorerStateCapsule) => void
    publishNavigatorToAppTitleBar?: boolean
}) {
    const preview = useFilePreview()
    const rootRef = useRef<HTMLElement | null>(null)
    const initialNavigationState = useMemo<PreviewNavigationWorkspaceState>(() => ({
        currentFolderPath: stateCapsule?.currentFolderPath,
        expandedPathKeys: stateCapsule?.expandedPaths,
        selectedPath: stateCapsule?.selectedPath
    }), [stateCapsule])
    const [navigationState, setNavigationState] = useState<PreviewNavigationWorkspaceState>(initialNavigationState)
    const [scrollAnchor, setScrollAnchor] = useState(stateCapsule?.scrollAnchor)
    const [previewPresentation, setPreviewPresentation] = useState<FilePreviewPresentationState | null>(() => (
        stateCapsule?.activePreview ? {
            ...stateCapsule.activePreview,
            mode: stateCapsule.activePreview.mode || 'preview',
            expanded: stateCapsule.activePreview.expanded === true
        } : null
    ))
    const hydrationKey = useMemo(() => stateCapsule ? JSON.stringify({
        folder: stateCapsule.currentFolderPath,
        expanded: stateCapsule.expandedPaths,
        selected: stateCapsule.selectedPath
    }) : 'default', [stateCapsule])
    const hydratedPreviewPathRef = useRef<string | null>(null)
    const pendingHydrationRef = useRef(stateCapsule)
    const openPreviewRef = useRef(preview.openPreview)
    const openPreviewInNewTabRef = useRef(preview.openPreviewInNewTab)
    openPreviewRef.current = preview.openPreview
    openPreviewInNewTabRef.current = preview.openPreviewInNewTab

    const handleOpenPreview = useCallback<UseFilePreviewReturn['openPreview']>(
        (file, ext, options) => openPreviewRef.current(file, ext, options),
        []
    )
    const handleOpenPreviewInNewTab = useCallback<UseFilePreviewReturn['openPreviewInNewTab']>(
        (file, ext, options) => openPreviewInNewTabRef.current(file, ext, options),
        []
    )

    useEffect(() => {
        pendingHydrationRef.current = stateCapsule
        const requested = stateCapsule?.activePreview
        if (!requested || hydratedPreviewPathRef.current === requested.path || preview.previewFile?.path === requested.path) return
        hydratedPreviewPathRef.current = requested.path
        void preview.openPreview({ name: requested.name, path: requested.path }, requested.extension)
    }, [preview.openPreview, preview.previewFile?.path, stateCapsule?.activePreview])

    useEffect(() => {
        restoreAssistantUtilityScrollAnchor(rootRef.current, stateCapsule?.scrollAnchor)
    }, [stateCapsule])

    useEffect(() => {
        const pendingHydration = pendingHydrationRef.current
        if (pendingHydration) {
            const expandedPaths = navigationState.expandedPathKeys || []
            const requestedExpandedPaths = pendingHydration.expandedPaths || []
            const navigationReady = (!pendingHydration.currentFolderPath || navigationState.currentFolderPath === pendingHydration.currentFolderPath)
                && (!pendingHydration.selectedPath || navigationState.selectedPath === pendingHydration.selectedPath || preview.previewFile?.path === pendingHydration.selectedPath)
                && requestedExpandedPaths.every((path) => expandedPaths.includes(path))
            const previewReady = !pendingHydration.activePreview || preview.previewFile?.path === pendingHydration.activePreview.path
            if (!navigationReady || !previewReady) return
            pendingHydrationRef.current = undefined
        }
        const activePreview = preview.previewFile ? {
            name: preview.previewFile.name,
            path: preview.previewFile.path,
            extension: preview.previewFile.name.includes('.') ? preview.previewFile.name.split('.').pop()?.toLowerCase() || '' : '',
            ...(previewPresentation?.path === preview.previewFile.path ? {
                mode: previewPresentation.mode,
                expanded: previewPresentation.expanded
            } : {})
        } : undefined
        onStateCapsuleChange?.({
            version: 1,
            workspace: 'explorer',
            currentFolderPath: navigationState.currentFolderPath,
            expandedPaths: navigationState.expandedPathKeys,
            selectedPath: activePreview?.path || navigationState.selectedPath,
            activePreview,
            scrollAnchor
        })
    }, [navigationState, onStateCapsuleChange, preview.previewFile, previewPresentation, scrollAnchor])

    useEffect(() => {
        if (!preview.previewFile) setPreviewPresentation(null)
    }, [preview.previewFile])

    return (
        <section
            ref={rootRef}
            onScrollCapture={(event) => {
                const anchor = captureAssistantUtilityScrollAnchor(event)
                if (anchor) setScrollAnchor(anchor)
            }}
            className="assistant-files-workspace relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[color-mix(in_srgb,var(--color-bg)_96%,black)]"
            aria-label="Files workspace"
        >
            <AssistantExplorerWorkspace
                key={`${projectPath || 'detached'}:${hydrationKey}`}
                projectPath={projectPath}
                onOpenPreview={handleOpenPreview}
                onOpenPreviewInNewTab={handleOpenPreviewInNewTab}
                initialWorkspaceState={initialNavigationState}
                onWorkspaceStateChange={setNavigationState}
            />

            {preview.previewFile ? (
                <FilesPreviewBoundary resetKey={preview.previewFile.path} onClose={preview.closePreview}>
                    <FilePreviewModal
                        file={preview.previewFile}
                        previewTabs={preview.previewTabs}
                        activePreviewTabId={preview.activePreviewTabId}
                        content={preview.previewContent}
                        loading={preview.loadingPreview}
                        truncated={preview.previewTruncated}
                        size={preview.previewSize}
                        previewBytes={preview.previewBytes}
                        modifiedAt={preview.previewModifiedAt}
                        projectPath={projectPath || undefined}
                        active={active}
                        chromeContext="workspace"
                        publishNavigatorToAppTitleBar={publishNavigatorToAppTitleBar}
                        initialPresentation={stateCapsule?.activePreview ? {
                            mode: stateCapsule.activePreview.mode || 'preview',
                            expanded: stateCapsule.activePreview.expanded === true
                        } : undefined}
                        onViewStateChange={setPreviewPresentation}
                        mediaItems={preview.previewMediaItems}
                        onOpenLinkedPreview={preview.openPreview}
                        onOpenLinkedPreviewInNewTab={preview.openPreviewInNewTab}
                        onSelectPreviewTab={preview.setActivePreviewTab}
                        onClosePreviewTab={preview.closePreviewTab}
                        onReorderPreviewTabs={preview.reorderPreviewTabs}
                        onClose={preview.closePreview}
                    />
                </FilesPreviewBoundary>
            ) : null}
        </section>
    )
})

class FilesPreviewBoundary extends Component<{
    children: ReactNode
    resetKey: string
    onClose: () => void
}, {
    failed: boolean
}> {
    state = { failed: false }

    static getDerivedStateFromError() {
        return { failed: true }
    }

    componentDidCatch(error: unknown) {
        console.error('Files preview failed:', error)
    }

    componentDidUpdate(previousProps: Readonly<{ children: ReactNode; resetKey: string; onClose: () => void }>) {
        if (this.state.failed && previousProps.resetKey !== this.props.resetKey) {
            this.setState({ failed: false })
        }
    }

    render() {
        if (!this.state.failed) return this.props.children
        return (
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-8 text-center backdrop-blur-md">
                <div className="w-full max-w-72 rounded-xl border border-white/10 bg-sparkle-card p-6 shadow-2xl">
                    <TriangleAlert size={20} className="mx-auto text-amber-300/75" />
                    <p className="mt-3 text-[12px] font-medium text-sparkle-text-secondary">Could not open this preview</p>
                    <button
                        type="button"
                        onClick={this.props.onClose}
                        className="mt-3 h-7 rounded-md border border-[var(--surface-divider)] px-3 text-[10px] font-medium text-sparkle-text-secondary hover:bg-[var(--surface-hover)] hover:text-sparkle-text"
                    >
                        Back to files
                    </button>
                </div>
            </div>
        )
    }
}
