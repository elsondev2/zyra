import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { CreateFileTypeModal } from '@/components/ui/CreateFileTypeModal'
import { FilePreviewModal } from '@/components/ui/FilePreviewModal'
import { PromptModal } from '@/components/ui/PromptModal'
import type { PreviewFile, PreviewMediaItem, PreviewOpenOptions } from '@/components/ui/file-preview/types'
import { cn } from '@/lib/utils'
import { ProjectsStatsModal } from '../projects/ProjectsStatsModal'
import type { FileSystemClipboardItem } from './folderBrowsePageUtils'
import { getProjectTypeById, type Project } from './types'

export function FolderBrowseOverlays(input: {
    closePreview: () => void
    cloneRepoErrorMessage: string | null
    cloneRepoModalOpen: boolean
    cloneRepoUrl: string
    confirmDeleteTarget: () => Promise<void>
    createDraft: string
    createErrorMessage: string | null
    createTarget: {
        destinationDirectory: string
        type: 'file' | 'directory'
        presetExtension?: string
    } | null
    deleteTarget: FileSystemClipboardItem | null
    decodedPath: string
    handleProjectClick: (project: Project) => void
    handleProjectDelete: (project: Project) => Promise<void>
    handleProjectRename: (project: Project) => Promise<void>
    loadingPreview: boolean
    onPreviewSaved: () => Promise<void>
    openPreview: (file: { name: string; path: string }, ext: string, options?: PreviewOpenOptions) => Promise<void>
    previewBytes?: number | null
    previewContent: string
    previewFile: PreviewFile | null
    previewMediaItems: PreviewMediaItem[]
    previewModifiedAt?: number | null
    previewSize?: number | null
    previewTruncated?: boolean
    renameDraft: string
    renameErrorMessage: string | null
    renameExtensionSuffix: string
    renameTarget: FileSystemClipboardItem | null
    setCreateDraft: (value: string) => void
    setCreateErrorMessage: (value: string | null) => void
    setCreateTarget: (value: null) => void
    setCloneRepoErrorMessage: (value: string | null) => void
    setCloneRepoModalOpen: (value: boolean) => void
    setCloneRepoUrl: (value: string) => void
    setDeleteTarget: (value: FileSystemClipboardItem | null) => void
    setRenameDraft: (value: string) => void
    setRenameErrorMessage: (value: string | null) => void
    setRenameExtensionSuffix: (value: string) => void
    setRenameTarget: (value: FileSystemClipboardItem | null) => void
    statsModalController: {
        statsModal: any
        modalTitle: string
        modalCount: number
        projectsModalQuery: string
        setProjectsModalQuery: (value: string) => void
        filteredModalProjects: any[]
        modalFrameworks: any[]
        modalTypes: any[]
        setStatsModal: (value: any) => void
    }
    submitCloneRepo: () => Promise<void>
    submitCreateTarget: (nextName?: string) => Promise<void>
    submitRenameTarget: () => Promise<void>
    toast: {
        message: string
        visible: boolean
        tone?: 'success' | 'error' | 'info'
        detail?: string
        progress?: number
        persistent?: boolean
    } | null
}) {
    const {
        closePreview,
        cloneRepoErrorMessage,
        cloneRepoModalOpen,
        cloneRepoUrl,
        confirmDeleteTarget,
        createDraft,
        createErrorMessage,
        createTarget,
        deleteTarget,
        decodedPath,
        handleProjectClick,
        handleProjectDelete,
        handleProjectRename,
        loadingPreview,
        onPreviewSaved,
        openPreview,
        previewBytes,
        previewContent,
        previewFile,
        previewMediaItems,
        previewModifiedAt,
        previewSize,
        previewTruncated,
        renameDraft,
        renameErrorMessage,
        renameExtensionSuffix,
        renameTarget,
        setCreateDraft,
        setCreateErrorMessage,
        setCreateTarget,
        setCloneRepoErrorMessage,
        setCloneRepoModalOpen,
        setCloneRepoUrl,
        setDeleteTarget,
        setRenameDraft,
        setRenameErrorMessage,
        setRenameExtensionSuffix,
        setRenameTarget,
        statsModalController,
        submitCloneRepo,
        submitCreateTarget,
        submitRenameTarget,
        toast
    } = input

    return (
        <>
            {previewFile && (
                <FilePreviewModal
                    file={previewFile}
                    content={previewContent}
                    loading={loadingPreview}
                    truncated={previewTruncated}
                    size={previewSize}
                    previewBytes={previewBytes}
                    modifiedAt={previewModifiedAt}
                    projectPath={decodedPath}
                    onOpenLinkedPreview={openPreview}
                    mediaItems={previewMediaItems}
                    onSaved={onPreviewSaved}
                    onClose={closePreview}
                />
            )}

            <ProjectsStatsModal
                statsModal={statsModalController.statsModal}
                modalTitle={statsModalController.modalTitle}
                modalCount={statsModalController.modalCount}
                projectsModalQuery={statsModalController.projectsModalQuery}
                setProjectsModalQuery={statsModalController.setProjectsModalQuery}
                filteredModalProjects={statsModalController.filteredModalProjects}
                modalFrameworks={statsModalController.modalFrameworks}
                modalTypes={statsModalController.modalTypes}
                onClose={() => statsModalController.setStatsModal(null)}
                onProjectClick={handleProjectClick}
                onProjectRename={handleProjectRename}
                onProjectDelete={handleProjectDelete}
                getProjectTypeLabel={(type) => getProjectTypeById(type)?.displayName || type}
                onOpenInExplorer={(path) => window.devscope.openInExplorer?.(path)}
            />

            <CreateFileTypeModal
                isOpen={Boolean(createTarget && createTarget.type === 'file')}
                destinationDirectory={createTarget?.destinationDirectory || ''}
                initialExtension={createTarget?.presetExtension}
                errorMessage={createErrorMessage}
                onCreate={async (fileName) => { await submitCreateTarget(fileName) }}
                onCancel={() => {
                    setCreateTarget(null)
                    setCreateErrorMessage(null)
                }}
            />
            <PromptModal
                isOpen={cloneRepoModalOpen}
                title="Clone Repository"
                message={`Clone into: ${decodedPath}`}
                value={cloneRepoUrl}
                onChange={(value) => {
                    setCloneRepoUrl(value)
                    if (cloneRepoErrorMessage) setCloneRepoErrorMessage(null)
                }}
                onConfirm={() => { void submitCloneRepo() }}
                onCancel={() => {
                    setCloneRepoModalOpen(false)
                    setCloneRepoUrl('')
                    setCloneRepoErrorMessage(null)
                }}
                confirmLabel="Clone"
                placeholder="https://github.com/owner/repo.git"
                maxLength={800}
                errorMessage={cloneRepoErrorMessage}
            />
            <PromptModal
                isOpen={Boolean(createTarget && createTarget.type === 'directory')}
                title="Create New Folder"
                message={createTarget ? `Create in: ${createTarget.destinationDirectory}` : ''}
                value={createDraft}
                onChange={(value) => {
                    setCreateDraft(value)
                    if (createErrorMessage) setCreateErrorMessage(null)
                }}
                onConfirm={() => { void submitCreateTarget() }}
                onCancel={() => {
                    setCreateTarget(null)
                    setCreateDraft('')
                    setCreateErrorMessage(null)
                }}
                confirmLabel="Create Folder"
                placeholder="Enter folder name"
                errorMessage={createErrorMessage}
            />
            <PromptModal
                isOpen={Boolean(renameTarget)}
                title="Rename Item"
                message={renameTarget
                    ? renameTarget.type === 'file'
                        ? `Rename "${renameTarget.name}" (file extension is locked for safety)`
                        : `Rename "${renameTarget.name}"`
                    : ''}
                value={renameDraft}
                onChange={(value) => {
                    setRenameDraft(value)
                    if (renameErrorMessage) setRenameErrorMessage(null)
                }}
                onConfirm={() => { void submitRenameTarget() }}
                onCancel={() => {
                    setRenameTarget(null)
                    setRenameDraft('')
                    setRenameExtensionSuffix('')
                    setRenameErrorMessage(null)
                }}
                confirmLabel="Rename"
                placeholder="Enter new name"
                valueSuffix={renameTarget?.type === 'file' ? renameExtensionSuffix : ''}
                errorMessage={renameErrorMessage}
            />
            <ConfirmModal
                isOpen={Boolean(deleteTarget)}
                title="Delete Item?"
                message={deleteTarget ? `Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.` : ''}
                confirmLabel="Delete"
                onConfirm={() => { void confirmDeleteTarget() }}
                onCancel={() => setDeleteTarget(null)}
                variant="danger"
                fullscreen
            />

            {toast && (
                <div
                    className={cn(
                        'fixed bottom-4 right-4 z-[120] max-w-sm rounded-xl px-4 py-3 text-sm shadow-lg backdrop-blur-md transition-all duration-300',
                        toast.tone === 'error'
                            ? 'border border-red-500/30 bg-red-500/10 text-red-200'
                            : toast.tone === 'info'
                                ? 'border border-sky-500/25 bg-sky-500/10 text-sky-100'
                            : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
                        toast.visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
                    )}
                >
                    <div className="font-medium">{toast.message}</div>
                    {toast.detail && (
                        <div className="mt-1 line-clamp-2 break-words text-xs opacity-75">{toast.detail}</div>
                    )}
                    {typeof toast.progress === 'number' && (
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                            <div
                                className={cn(
                                    'h-full rounded-full transition-[width] duration-300',
                                    toast.tone === 'error'
                                        ? 'bg-red-300'
                                        : toast.tone === 'info'
                                            ? 'bg-sky-300'
                                            : 'bg-emerald-300'
                                )}
                                style={{ width: `${Math.max(0, Math.min(100, toast.progress))}%` }}
                            />
                        </div>
                    )}
                </div>
            )}
        </>
    )
}
