import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    PointerSensor,
    useSensor,
    useSensors,
    type DragCancelEvent,
    type DragEndEvent,
    type DragStartEvent
} from '@dnd-kit/core'
import { useNavigate } from 'react-router-dom'
import { CreateFileTypeModal } from '@/components/ui/CreateFileTypeModal'
import { VscodeEntryIcon } from '@/components/ui/VscodeEntryIcon'
import { getFileExtensionFromName, validateCreateName } from '@/lib/filesystem/fileSystemPaths'
import { cn } from '@/lib/utils'
import type { PreviewFile, PreviewMediaItem, PreviewOpenOptions } from './types'
import { navigateMarkdownLink } from '../markdown/linkNavigation'

type PreviewDragOverlayState =
    | {
        type: 'file'
        name: string
        path: string
    }
    | {
        type: 'tab'
        id: string
        file: PreviewFile
    }
    | null

export function useFilePreviewModalInteractions(input: {
    file: PreviewFile
    mediaItems: PreviewMediaItem[]
    settingsTheme: string
    resolvedActivePreviewTabId: string | null
    createDestinationDirectory: string
    canCreateSiblingFile: boolean
    onOpenLinkedPreview?: (file: { name: string; path: string }, ext: string, options?: PreviewOpenOptions) => Promise<void>
    onOpenLinkedPreviewInNewTab?: (file: { name: string; path: string }, ext: string, options?: PreviewOpenOptions) => Promise<void>
    onSelectPreviewTab?: (tabId: string) => void
    onClosePreviewTab?: (tabId: string) => void
    onReorderPreviewTabs?: (activeTabId: string, overTabId: string | null) => void
    requestExternalIntent: (intent: () => void | Promise<void>) => void
}) {
    const {
        file,
        mediaItems,
        settingsTheme,
        resolvedActivePreviewTabId,
        createDestinationDirectory,
        canCreateSiblingFile,
        onOpenLinkedPreview,
        onOpenLinkedPreviewInNewTab,
        onSelectPreviewTab,
        onClosePreviewTab,
        onReorderPreviewTabs,
        requestExternalIntent
    } = input

    const navigate = useNavigate()
    const [createModalOpen, setCreateModalOpen] = useState(false)
    const [createModalError, setCreateModalError] = useState<string | null>(null)
    const [folderTreeRefreshToken, setFolderTreeRefreshToken] = useState(0)
    const [preserveSidebarContextRequest, setPreserveSidebarContextRequest] = useState<{ path: string; nonce: number } | null>(null)
    const [activeDragOverlay, setActiveDragOverlay] = useState<PreviewDragOverlayState>(null)
    const dndSensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 6 }
        })
    )

    useEffect(() => {
        setCreateModalOpen(false)
        setCreateModalError(null)
    }, [file.path])

    const markPreserveSidebarContext = useCallback((targetPath: string) => {
        const normalizedPath = String(targetPath || '').trim()
        if (!normalizedPath) return
        setPreserveSidebarContextRequest((currentRequest) => ({
            path: normalizedPath,
            nonce: (currentRequest?.nonce || 0) + 1
        }))
    }, [])

    const openMediaItem = useCallback(async (item: PreviewMediaItem) => {
        if (!onOpenLinkedPreview) return
        markPreserveSidebarContext(item.path)
        requestExternalIntent(() => onOpenLinkedPreview({ name: item.name, path: item.path }, item.extension, {
            mediaItems: mediaItems.map(({ name, path, extension }) => ({ name, path, extension }))
        }))
    }, [markPreserveSidebarContext, mediaItems, onOpenLinkedPreview, requestExternalIntent])

    const handleInternalMarkdownLink = useCallback(async (href: string) => {
        const openPreview = async (
            nextFile: { name: string; path: string },
            ext: string,
            options?: PreviewOpenOptions
        ) => {
            if (!onOpenLinkedPreview) return
            markPreserveSidebarContext(nextFile.path)
            requestExternalIntent(() => onOpenLinkedPreview(nextFile, ext, options))
        }
        await navigateMarkdownLink({ href, filePath: file.path, navigate, openPreview })
    }, [file.path, markPreserveSidebarContext, navigate, onOpenLinkedPreview, requestExternalIntent])

    const handleSelectPreviewTab = useCallback((tabId: string) => {
        if (!onSelectPreviewTab || tabId === resolvedActivePreviewTabId) return
        requestExternalIntent(() => onSelectPreviewTab(tabId))
    }, [onSelectPreviewTab, requestExternalIntent, resolvedActivePreviewTabId])

    const handleClosePreviewTab = useCallback((tabId: string) => {
        if (!onClosePreviewTab) return
        if (tabId !== resolvedActivePreviewTabId) {
            onClosePreviewTab(tabId)
            return
        }
        requestExternalIntent(() => onClosePreviewTab(tabId))
    }, [onClosePreviewTab, requestExternalIntent, resolvedActivePreviewTabId])

    const handleOpenLinkedPreview = useCallback(async (
        nextFile: { name: string; path: string },
        ext: string,
        options?: PreviewOpenOptions
    ) => {
        if (!onOpenLinkedPreview) return
        markPreserveSidebarContext(nextFile.path)
        requestExternalIntent(() => onOpenLinkedPreview(nextFile, ext, options))
    }, [markPreserveSidebarContext, onOpenLinkedPreview, requestExternalIntent])

    const handleOpenLinkedPreviewInNewTab = useCallback(async (
        nextFile: { name: string; path: string },
        ext: string,
        options?: PreviewOpenOptions
    ) => {
        if (!onOpenLinkedPreviewInNewTab) return
        markPreserveSidebarContext(nextFile.path)
        requestExternalIntent(() => onOpenLinkedPreviewInNewTab(nextFile, ext, options))
    }, [markPreserveSidebarContext, onOpenLinkedPreviewInNewTab, requestExternalIntent])

    const handleOpenInBrowser = useCallback(async () => {
        try {
            await window.devscope.openFile(file.path)
        } catch (error) {
            console.error('Failed to open in browser:', error)
        }
    }, [file.path])

    const handleOpenCreateSiblingFileModal = useCallback(() => {
        if (!canCreateSiblingFile) return
        setCreateModalError(null)
        setCreateModalOpen(true)
    }, [canCreateSiblingFile])

    const handleCreateSiblingFile = useCallback(async (nextName: string) => {
        if (!canCreateSiblingFile || !onOpenLinkedPreview || !createDestinationDirectory) {
            setCreateModalError('Unable to resolve destination folder.')
            return
        }

        const normalizedName = String(nextName || '').trim()
        const validationError = validateCreateName(normalizedName)
        if (validationError) {
            setCreateModalError(validationError)
            return
        }

        const result = await window.devscope.createFileSystemItem(
            createDestinationDirectory,
            normalizedName,
            'file'
        )

        if (!result.success) {
            setCreateModalError(result.error || 'Failed to create file.')
            return
        }

        if (!result.path || !result.name) {
            setCreateModalError('Failed to create file.')
            return
        }

        setCreateModalError(null)
        setCreateModalOpen(false)
        setFolderTreeRefreshToken((current) => current + 1)
        await handleOpenLinkedPreview(
            { name: result.name, path: result.path },
            getFileExtensionFromName(result.name) || 'txt',
            { startInEditMode: true }
        )
    }, [canCreateSiblingFile, createDestinationDirectory, handleOpenLinkedPreview, onOpenLinkedPreview])

    const handlePreviewDragStart = useCallback((event: DragStartEvent) => {
        const activeType = event.active.data.current?.type

        if (activeType === 'preview-file-tree') {
            const draggedFile = event.active.data.current?.file as { name: string; path: string } | undefined
            if (!draggedFile) {
                setActiveDragOverlay(null)
                return
            }
            setActiveDragOverlay({
                type: 'file',
                name: draggedFile.name,
                path: draggedFile.path
            })
            return
        }

        if (activeType === 'preview-tab') {
            const tabId = String(event.active.data.current?.tabId || '')
            const tabFile = event.active.data.current?.file as PreviewFile | undefined
            if (!tabId || !tabFile) {
                setActiveDragOverlay(null)
                return
            }
            setActiveDragOverlay({
                type: 'tab',
                id: tabId,
                file: tabFile
            })
            return
        }

        setActiveDragOverlay(null)
    }, [])

    const handlePreviewDragCancel = useCallback((_event: DragCancelEvent) => {
        setActiveDragOverlay(null)
    }, [])

    const handlePreviewDragEnd = useCallback((event: DragEndEvent) => {
        setActiveDragOverlay(null)
        const activeType = event.active.data.current?.type
        const overId = event.over?.id ? String(event.over.id) : null

        if (activeType === 'preview-tab') {
            const dragTabId = String(event.active.data.current?.tabId || event.active.id)
            const overTabId = overId?.startsWith('preview-tab:') ? overId.slice('preview-tab:'.length) : overId
            if (!onReorderPreviewTabs) return
            onReorderPreviewTabs(dragTabId, overTabId)
            return
        }

        if (activeType !== 'preview-file-tree') return
        if (!overId || !['preview-tab-strip', 'preview-new-tab'].includes(overId) && !overId.startsWith('preview-tab:')) return

        const draggedFile = event.active.data.current?.file as { name: string; path: string } | undefined
        const draggedExt = event.active.data.current?.ext as string | undefined
        if (!draggedFile || !draggedExt) return
        void handleOpenLinkedPreviewInNewTab(draggedFile, draggedExt)
    }, [handleOpenLinkedPreviewInNewTab, onReorderPreviewTabs])

    const dragOverlay = useMemo(() => {
        if (!activeDragOverlay) return null
        return (
            <div
                className={cn(
                    'pointer-events-none inline-flex items-center gap-2 rounded-md border border-white/[0.12] bg-[#0f1722]/96 px-2 py-1.5 text-[11px] text-white shadow-[0_16px_36px_rgba(0,0,0,0.38)]',
                    activeDragOverlay.type === 'tab' ? 'max-w-[220px]' : 'max-w-[280px]'
                )}
            >
                <VscodeEntryIcon
                    pathValue={activeDragOverlay.type === 'tab' ? activeDragOverlay.file.path : activeDragOverlay.path}
                    kind="file"
                    theme={settingsTheme === 'light' ? 'light' : 'dark'}
                    className="size-3.5 shrink-0"
                />
                <span className="min-w-0 truncate">
                    {activeDragOverlay.type === 'tab' ? activeDragOverlay.file.name : activeDragOverlay.name}
                </span>
            </div>
        )
    }, [activeDragOverlay, settingsTheme])

    const createFileModal = canCreateSiblingFile ? (
        <CreateFileTypeModal
            isOpen={createModalOpen}
            destinationDirectory={createDestinationDirectory}
            initialExtension={getFileExtensionFromName(file.name) || 'txt'}
            errorMessage={createModalError}
            onCreate={handleCreateSiblingFile}
            onCancel={() => {
                setCreateModalOpen(false)
                setCreateModalError(null)
            }}
        />
    ) : null

    return {
        folderTreeRefreshToken,
        preserveSidebarContextRequest,
        dndSensors,
        openMediaItem,
        handleInternalMarkdownLink,
        handleSelectPreviewTab,
        handleClosePreviewTab,
        handleOpenLinkedPreview,
        handleOpenLinkedPreviewInNewTab,
        handleOpenInBrowser,
        handleOpenCreateSiblingFileModal,
        handlePreviewDragStart,
        handlePreviewDragCancel,
        handlePreviewDragEnd,
        dragOverlay,
        createFileModal
    }
}
