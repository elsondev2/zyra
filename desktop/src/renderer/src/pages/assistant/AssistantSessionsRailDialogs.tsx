import { createPortal } from 'react-dom'
import { Edit2, Loader2 } from 'lucide-react'
import type { AssistantPlaygroundState, AssistantSession } from '@shared/assistant/contracts'
import type { DevScopeFolderItem } from '@shared/contracts/devscope-api'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { cn } from '@/lib/utils'
import { getSessionDisplayTitle } from './assistant-sessions-rail-utils'

export function PlaygroundLabModal(props: {
    open: boolean
    playground: AssistantPlaygroundState
    title: string
    repoUrl: string
    source: 'empty' | 'git-clone' | 'existing-folder'
    creating: boolean
    existingRootFolders: DevScopeFolderItem[]
    existingRootFoldersLoading: boolean
    selectedExistingFolderPath: string
    onClose: () => void
    onChangeTitle: (value: string) => void
    onChangeRepoUrl: (value: string) => void
    onChangeSource: (value: 'empty' | 'git-clone' | 'existing-folder') => void
    onChangeSelectedExistingFolderPath: (value: string) => void
    onSubmit: () => void
}) {
    const {
        open,
        playground,
        title,
        repoUrl,
        source,
        creating,
        existingRootFolders,
        existingRootFoldersLoading,
        selectedExistingFolderPath,
        onClose,
        onChangeTitle,
        onChangeRepoUrl,
        onChangeSource,
        onChangeSelectedExistingFolderPath,
        onSubmit
    } = props
    if (!open || typeof document === 'undefined') return null
    const handleRequestClose = () => {
        if (creating) return
        onClose()
    }
    const registeredLabByPath = new Map(playground.labs.map((lab) => [lab.rootPath, lab]))
    const hasExistingFolders = existingRootFolders.length > 0
    const submitDisabled = creating
        || (source === 'git-clone' && !repoUrl.trim())
        || (source === 'existing-folder' && !selectedExistingFolderPath && hasExistingFolders)
    const submitLabel = creating
        ? source === 'git-clone'
            ? 'Cloning Repo...'
            : source === 'existing-folder'
                ? 'Preparing Chat...'
                : 'Creating Project...'
        : source === 'existing-folder' && registeredLabByPath.get(selectedExistingFolderPath)
            ? 'Open Project Chat'
            : 'Create Project'

    return createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" onClick={handleRequestClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-fadeIn" />
            <div className="relative w-full max-w-md overflow-hidden rounded-[24px] border border-white/10 bg-sparkle-card shadow-2xl animate-scaleIn" onClick={(event) => event.stopPropagation()}>
                <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[var(--accent-primary)]/40 via-[var(--accent-primary)]/10 to-transparent" />
                <div className="p-6">
                    <h3 className="mb-1 text-lg font-bold tracking-tight text-white">Add Project</h3>
                    <p className="mb-5 text-sm text-sparkle-text-secondary">Start blank, clone a repo, or use an existing folder.</p>
                    <div className="mb-4 grid grid-cols-3 gap-2">
                        {([
                            ['empty', 'Empty'],
                            ['git-clone', 'Clone'],
                            ['existing-folder', 'Existing']
                        ] as const).map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                disabled={creating}
                                onClick={() => onChangeSource(value)}
                                className={cn(
                                    'rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
                                    source === value
                                        ? 'border-white/20 bg-white/[0.08] text-sparkle-text'
                                        : 'border-white/10 bg-white/[0.02] text-sparkle-text-muted/70 hover:bg-white/[0.04] hover:text-sparkle-text',
                                    creating && 'cursor-not-allowed opacity-55 hover:bg-white/[0.02] hover:text-sparkle-text-muted/70'
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="space-y-3">
                        <input
                            value={title}
                            disabled={creating}
                            onChange={(event) => onChangeTitle(event.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-sparkle-bg px-4 py-3 text-sm text-sparkle-text outline-none transition-all focus:border-[var(--accent-primary)]/40 focus:ring-4 focus:ring-[var(--accent-primary)]/10"
                            placeholder="Project name"
                            maxLength={120}
                        />
                        {source === 'git-clone' ? (
                            <input
                                value={repoUrl}
                                disabled={creating}
                                onChange={(event) => onChangeRepoUrl(event.target.value)}
                                className="w-full rounded-xl border border-white/10 bg-sparkle-bg px-4 py-3 text-sm text-sparkle-text outline-none transition-all focus:border-[var(--accent-primary)]/40 focus:ring-4 focus:ring-[var(--accent-primary)]/10"
                                placeholder="https://github.com/owner/repo.git"
                            />
                        ) : null}
                        {source === 'existing-folder' ? (
                            <div className="space-y-2">
                                {existingRootFoldersLoading ? (
                                    <p className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3 text-xs text-sparkle-text-muted/70">
                                        Loading folders from your projects folder...
                                    </p>
                                ) : hasExistingFolders ? (
                                    <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.02] p-2 custom-scrollbar">
                                        {existingRootFolders.map((folder) => {
                                            const existingLab = registeredLabByPath.get(folder.path) || null
                                            return (
                                                <button
                                                    key={folder.path}
                                                    type="button"
                                                    disabled={creating}
                                                    onClick={() => onChangeSelectedExistingFolderPath(folder.path)}
                                                    className={cn(
                                                        'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                                                        selectedExistingFolderPath === folder.path
                                                            ? 'bg-white/[0.08] text-sparkle-text'
                                                            : 'text-sparkle-text-secondary hover:bg-white/[0.04]',
                                                        creating && 'cursor-not-allowed opacity-55 hover:bg-transparent'
                                                    )}
                                                >
                                                    <div className="min-w-0">
                                                        <div className="truncate text-sm font-medium">{folder.name}</div>
                                                        <div className="truncate text-[11px] text-sparkle-text-muted/60">{folder.path}</div>
                                                    </div>
                                                    <span className="shrink-0 rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-sparkle-text-muted/75">
                                                        {existingLab ? 'Added' : 'Folder'}
                                                    </span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3 text-xs text-sparkle-text-muted/70">
                                        <p>No folders found in this projects folder.</p>
                                        <button
                                            type="button"
                                            onClick={() => onChangeSource('empty')}
                                            className="mt-2 text-[11px] font-medium text-sparkle-text transition-colors hover:text-white"
                                        >
                                            Start from scratch instead
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </div>
                    {creating ? (
                        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-sparkle-text">
                                <Loader2 size={15} className="animate-spin text-[var(--accent-primary)]" />
                                <span>{source === 'git-clone' ? 'Cloning repository...' : 'Preparing project...'}</span>
                            </div>
                            <p className="mt-1 text-xs text-sparkle-text-muted/70">
                                {source === 'git-clone'
                                    ? 'The dialog stays open until the clone finishes and the new chat is ready.'
                                    : 'The dialog stays open until the new chat is ready.'}
                            </p>
                        </div>
                    ) : null}
                    <div className="mt-7 flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handleRequestClose}
                            disabled={creating}
                            className={cn(
                                'flex-1 rounded-xl border border-white/10 bg-sparkle-bg px-4 py-2.5 text-sm font-semibold text-sparkle-text-secondary transition-all hover:border-white/20 hover:bg-sparkle-card-hover hover:text-white',
                                creating && 'cursor-not-allowed opacity-55 hover:border-white/10 hover:bg-sparkle-bg hover:text-sparkle-text-secondary'
                            )}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={onSubmit}
                            disabled={submitDisabled}
                            className={cn(
                                'flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition-all shadow-lg',
                                submitDisabled
                                    ? 'bg-sparkle-border/40 text-sparkle-text-muted cursor-not-allowed opacity-50'
                                    : 'bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90 shadow-[var(--accent-primary)]/20 active:scale-[0.98]'
                            )}
                        >
                            {submitLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    )
}

export function RenameSessionModal(props: {
    renameTarget: AssistantSession | null
    renameDraft: string
    saving?: boolean
    onChangeDraft: (value: string) => void
    onClose: () => void
    onSubmit: () => void
}) {
    const { renameTarget, renameDraft, saving = false, onChangeDraft, onClose, onSubmit } = props
    if (!renameTarget || typeof document === 'undefined') return null

    return createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="relative w-full max-w-sm overflow-hidden rounded-xl border border-white/10 bg-sparkle-card shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div className="p-4">
                    <h3 className="mb-4 text-sm font-semibold text-sparkle-text">Rename chat</h3>
                    <div className="relative group">
                        <Edit2 size={14} className="absolute left-3 top-3 text-sparkle-text-muted transition-colors group-focus-within:text-[var(--accent-primary)]" />
                        <input
                            autoFocus
                            value={renameDraft}
                            disabled={saving}
                            onChange={(event) => onChangeDraft(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault()
                                    onSubmit()
                                } else if (event.key === 'Escape') {
                                    event.preventDefault()
                                    onClose()
                                }
                            }}
                            className="w-full rounded-lg border border-white/10 bg-sparkle-bg py-2.5 pl-9 pr-3 text-sm text-sparkle-text outline-none transition-colors focus:border-[var(--accent-primary)]/35"
                            placeholder="Refactor login flow"
                            maxLength={60}
                        />
                    </div>
                    <div className="mt-4 flex items-center justify-end gap-2">
                        <button type="button" onClick={onClose} disabled={saving} className="rounded-lg px-3 py-2 text-sm text-sparkle-text-secondary transition-colors hover:bg-white/[0.04] hover:text-sparkle-text disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
                        <button
                            type="button"
                            onClick={onSubmit}
                            disabled={saving || !renameDraft.trim()}
                            className={cn(
                                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                !saving && renameDraft.trim()
                                    ? 'bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90'
                                    : 'cursor-not-allowed bg-white/[0.04] text-sparkle-text-muted/45'
                            )}
                        >
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    )
}

export function SessionDeleteModal(props: {
    sessionToDelete: AssistantSession | null
    deleting: boolean
    onConfirm: () => void
    onCancel: () => void
}) {
    const { sessionToDelete, deleting, onConfirm, onCancel } = props
    return (
        <ConfirmModal
            isOpen={Boolean(sessionToDelete)}
            title="Delete Chat?"
            message={`Are you sure you want to delete "${sessionToDelete ? getSessionDisplayTitle(sessionToDelete) : 'this chat'}"? This action cannot be undone.`}
            confirmLabel={deleting ? 'Deleting...' : 'Delete Chat'}
            onConfirm={onConfirm}
            onCancel={onCancel}
            variant="danger"
            fullscreen
        />
    )
}

export function LabDeleteModal(props: {
    labToDelete: { labId: string; label: string } | null
    deletingLabId: string | null
    onConfirm: () => void
    onCancel: () => void
}) {
    const { labToDelete, deletingLabId, onConfirm, onCancel } = props
    return (
        <ConfirmModal
            isOpen={Boolean(labToDelete)}
            title="Remove Project?"
            message={`Remove "${labToDelete?.label || 'this project'}" from the sidebar? Files stay on disk. Chats with history move to Chats, and empty chats are removed.`}
            confirmLabel={deletingLabId ? 'Removing...' : 'Remove Project'}
            onConfirm={onConfirm}
            onCancel={onCancel}
            variant="danger"
            fullscreen
        />
    )
}

export function ProjectChatsDeleteModal(props: {
    projectChatsToDelete: { label: string; sessionIds: string[] } | null
    deletingProjectChats: boolean
    onConfirm: () => void
    onCancel: () => void
}) {
    const { projectChatsToDelete, deletingProjectChats, onConfirm, onCancel } = props
    return (
        <ConfirmModal
            isOpen={Boolean(projectChatsToDelete)}
            title="Delete Project Chats?"
            message={`Delete all chats under "${projectChatsToDelete?.label || 'this project'}"? This removes the grouped chats only and does not delete the project folder on disk.`}
            confirmLabel={deletingProjectChats ? 'Deleting...' : 'Delete Chats'}
            onConfirm={onConfirm}
            onCancel={onCancel}
            variant="danger"
            fullscreen
        />
    )
}
