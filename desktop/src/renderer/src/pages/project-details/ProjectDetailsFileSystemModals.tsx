import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { CreateFileTypeModal } from '@/components/ui/CreateFileTypeModal'
import { PromptModal } from '@/components/ui/PromptModal'

export function ProjectDetailsFileSystemModals(props: any) {
    const {
        createTarget,
        createErrorMessage,
        submitCreateTarget,
        setCreateTarget,
        createDraft,
        setCreateDraft,
        setCreateErrorMessage,
        renameTarget,
        renameDraft,
        setRenameDraft,
        renameErrorMessage,
        submitRenameTarget,
        setRenameTarget,
        setRenameExtensionSuffix,
        renameExtensionSuffix,
        setRenameErrorMessage,
        deleteTarget,
        confirmDeleteTarget,
        setDeleteTarget
    } = props

    return (
        <>
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
        </>
    )
}
