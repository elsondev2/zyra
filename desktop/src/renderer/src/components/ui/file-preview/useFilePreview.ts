import { useMemo, useRef, useState } from 'react'
import type { PreviewFile, PreviewMediaItem, PreviewMediaSource, PreviewOpenOptions, PreviewTab } from './types'
import { isMediaPreviewType, resolvePreviewType } from './utils'

async function yieldToBrowserPaint(): Promise<void> {
    await new Promise<void>((resolve) => {
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(() => resolve())
            return
        }
        setTimeout(resolve, 0)
    })
}

export interface UseFilePreviewReturn {
    previewTabs: PreviewTab[]
    activePreviewTabId: string | null
    previewFile: PreviewFile | null
    previewMediaItems: PreviewMediaItem[]
    previewContent: string
    loadingPreview: boolean
    previewTruncated: boolean
    previewSize: number | null
    previewBytes: number | null
    previewModifiedAt: number | null
    openPreview: (
        file: { name: string; path: string },
        ext: string,
        options?: PreviewOpenOptions
    ) => Promise<void>
    openPreviewInNewTab: (
        file: { name: string; path: string },
        ext: string,
        options?: PreviewOpenOptions
    ) => Promise<void>
    setActivePreviewTab: (tabId: string) => void
    closePreviewTab: (tabId: string) => void
    reorderPreviewTabs: (activeTabId: string, overTabId: string | null) => void
    closePreview: () => void
    openFile: (filePath: string) => Promise<void>
}

type PreviewTabState = PreviewTab & {
    mediaItems: PreviewMediaItem[]
    content: string
    loading: boolean
    truncated: boolean
    size: number | null
    previewBytes: number | null
    modifiedAt: number | null
    requestId: number
}

function createPreviewTabId(): string {
    return `preview-tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizePreviewContent(content: unknown): string {
    if (typeof content === 'string') return content
    if (content == null) return ''
    if (typeof content === 'number' || typeof content === 'boolean' || typeof content === 'bigint') {
        return String(content)
    }
    try {
        return JSON.stringify(content, null, 2)
    } catch {
        return String(content)
    }
}

function normalizeMediaItems(items?: PreviewMediaSource[]): PreviewMediaItem[] {
    if (!items?.length) return []

    const deduped = new Map<string, PreviewMediaItem>()
    for (const item of items) {
        const name = String(item?.name || '').trim()
        const path = String(item?.path || '').trim()
        const extension = String(item?.extension || '').trim().toLowerCase()
        if (!name || !path) continue

        const previewTarget = resolvePreviewType(name, extension)
        if (!previewTarget || !isMediaPreviewType(previewTarget.type)) continue

        const dedupeKey = path.toLowerCase()
        if (deduped.has(dedupeKey)) continue

        deduped.set(dedupeKey, {
            name,
            path,
            extension,
            thumbnailPath: item.thumbnailPath ?? null,
            type: previewTarget.type
        })
    }

    return Array.from(deduped.values())
}

export function useFilePreview(): UseFilePreviewReturn {
    const [previewTabsState, setPreviewTabsState] = useState<PreviewTabState[]>([])
    const [activePreviewTabId, setActivePreviewTabId] = useState<string | null>(null)
    const activePreviewRequestIdRef = useRef(0)
    const focusLineRequestIdRef = useRef(0)
    const activePreviewTab = useMemo(
        () => previewTabsState.find((tab) => tab.id === activePreviewTabId) || null,
        [activePreviewTabId, previewTabsState]
    )

    const openFile = async (filePath: string) => {
        try {
            const res = await window.devscope.openFile(filePath)
            if (!res.success) {
                console.error('Failed to open file:', res.error)
            }
        } catch (err) {
            console.error('Failed to open file:', err)
        }
    }

    const updatePreviewTab = (tabId: string, updater: (tab: PreviewTabState) => PreviewTabState) => {
        setPreviewTabsState((currentTabs) => currentTabs.map((tab) => (tab.id === tabId ? updater(tab) : tab)))
    }

    const loadPreviewTabContent = async (tabId: string, file: { name: string; path: string }, ext: string) => {
        const previewTarget = resolvePreviewType(file.name, ext)
        if (!previewTarget || !previewTarget.needsContent) return

        const requestId = activePreviewRequestIdRef.current + 1
        activePreviewRequestIdRef.current = requestId

        updatePreviewTab(tabId, (tab) => ({
            ...tab,
            loading: true,
            content: '',
            truncated: false,
            size: null,
            previewBytes: null,
            modifiedAt: null,
            requestId
        }))

        await yieldToBrowserPaint()

        try {
            const res = await window.devscope.readFileContent(file.path)
            setPreviewTabsState((currentTabs) => currentTabs.map((tab) => {
                if (tab.id !== tabId || tab.requestId !== requestId) return tab
                if (!res.success) {
                    console.error('Failed to load file:', res.error)
                    return {
                        ...tab,
                        loading: false
                    }
                }
                return {
                    ...tab,
                    content: normalizePreviewContent(res.content),
                    loading: false,
                    truncated: Boolean(res.truncated),
                    size: typeof res.size === 'number' ? res.size : null,
                    previewBytes: typeof res.previewBytes === 'number' ? res.previewBytes : null,
                    modifiedAt: typeof res.modifiedAt === 'number' ? res.modifiedAt : null
                }
            }))
        } catch (err) {
            console.error('Failed to load file:', err)
            setPreviewTabsState((currentTabs) => currentTabs.map((tab) => (
                tab.id === tabId && tab.requestId === requestId
                    ? { ...tab, loading: false }
                    : tab
            )))
        }
    }

    const openPreviewWithMode = async (
        file: { name: string; path: string },
        ext: string,
        options: PreviewOpenOptions | undefined,
        mode: 'replace' | 'new-tab'
    ) => {
        const previewTarget = resolvePreviewType(file.name, ext)

        if (!previewTarget) {
            void openFile(file.path)
            return
        }

        const requestedFocusLine = typeof options?.focusLine === 'number' && options.focusLine > 0
            ? Math.floor(options.focusLine)
            : null
        const focusLineRequestId = requestedFocusLine
            ? focusLineRequestIdRef.current + 1
            : null
        if (focusLineRequestId) {
            focusLineRequestIdRef.current = focusLineRequestId
        }

        const nextFile: PreviewFile = {
            name: file.name,
            path: file.path,
            type: previewTarget.type,
            language: previewTarget.language,
            startInEditMode: options?.startInEditMode === true,
            focusLine: requestedFocusLine,
            focusLineRequestId
        }
        const nextMediaItems = normalizeMediaItems(options?.mediaItems)
        const existingTab = previewTabsState.find((tab) => tab.file.path.toLowerCase() === file.path.toLowerCase()) || null

        if (existingTab) {
            updatePreviewTab(existingTab.id, (tab) => ({
                ...tab,
                file: nextFile,
                mediaItems: nextMediaItems
            }))
            setActivePreviewTabId(existingTab.id)
            if (previewTarget.needsContent && !existingTab.content && !existingTab.loading) {
                await loadPreviewTabContent(existingTab.id, file, ext)
            }
            return
        }

        let targetTabId: string
        let shouldLoad = previewTarget.needsContent

        if (mode === 'replace' && activePreviewTabId) {
            targetTabId = activePreviewTabId
            setPreviewTabsState((currentTabs) => currentTabs.map((tab) => (
                tab.id === activePreviewTabId
                    ? {
                        ...tab,
                        file: nextFile,
                        mediaItems: nextMediaItems,
                        content: '',
                        loading: previewTarget.needsContent,
                        truncated: false,
                        size: null,
                        previewBytes: null,
                        modifiedAt: null,
                        requestId: 0
                    }
                    : tab
            )))
        } else {
            targetTabId = createPreviewTabId()
            const nextTab: PreviewTabState = {
                id: targetTabId,
                file: nextFile,
                mediaItems: nextMediaItems,
                content: '',
                loading: previewTarget.needsContent,
                truncated: false,
                size: null,
                previewBytes: null,
                modifiedAt: null,
                requestId: 0
            }
            setPreviewTabsState((currentTabs) => {
                if (mode === 'new-tab' && activePreviewTabId) {
                    const activeIndex = currentTabs.findIndex((tab) => tab.id === activePreviewTabId)
                    if (activeIndex >= 0) {
                        const nextTabs = [...currentTabs]
                        nextTabs.splice(activeIndex + 1, 0, nextTab)
                        return nextTabs
                    }
                }
                return [...currentTabs, nextTab]
            })
        }

        setActivePreviewTabId(targetTabId)

        if (shouldLoad) {
            await loadPreviewTabContent(targetTabId, file, ext)
        }
    }

    const openPreview = async (
        file: { name: string; path: string },
        ext: string,
        options?: PreviewOpenOptions
    ) => openPreviewWithMode(file, ext, options, 'replace')

    const openPreviewInNewTab = async (
        file: { name: string; path: string },
        ext: string,
        options?: PreviewOpenOptions
    ) => openPreviewWithMode(file, ext, options, 'new-tab')

    const setActivePreviewTab = (tabId: string) => {
        setActivePreviewTabId((currentActiveTabId) => {
            if (!previewTabsState.some((tab) => tab.id === tabId)) return currentActiveTabId
            return tabId
        })
    }

    const closePreviewTab = (tabId: string) => {
        setPreviewTabsState((currentTabs) => {
            const targetIndex = currentTabs.findIndex((tab) => tab.id === tabId)
            if (targetIndex < 0) return currentTabs
            const nextTabs = currentTabs.filter((tab) => tab.id !== tabId)
            setActivePreviewTabId((currentActiveTabId) => {
                if (currentActiveTabId !== tabId) return currentActiveTabId
                const nextActiveTab = nextTabs[targetIndex] || nextTabs[targetIndex - 1] || null
                return nextActiveTab?.id || null
            })
            return nextTabs
        })
    }

    const reorderPreviewTabs = (dragTabId: string, overTabId: string | null) => {
        if (!overTabId || dragTabId === overTabId) return
        setPreviewTabsState((currentTabs) => {
            const activeIndex = currentTabs.findIndex((tab) => tab.id === dragTabId)
            const overIndex = currentTabs.findIndex((tab) => tab.id === overTabId)
            if (activeIndex < 0 || overIndex < 0) return currentTabs
            const nextTabs = [...currentTabs]
            const [movedTab] = nextTabs.splice(activeIndex, 1)
            nextTabs.splice(overIndex, 0, movedTab)
            return nextTabs
        })
    }

    const closePreview = () => {
        activePreviewRequestIdRef.current += 1
        setPreviewTabsState([])
        setActivePreviewTabId(null)
    }

    return {
        previewTabs: previewTabsState.map(({ id, file }) => ({ id, file })),
        activePreviewTabId,
        previewFile: activePreviewTab?.file || null,
        previewMediaItems: activePreviewTab?.mediaItems || [],
        previewContent: activePreviewTab?.content || '',
        loadingPreview: activePreviewTab?.loading || false,
        previewTruncated: activePreviewTab?.truncated || false,
        previewSize: activePreviewTab?.size ?? null,
        previewBytes: activePreviewTab?.previewBytes ?? null,
        previewModifiedAt: activePreviewTab?.modifiedAt ?? null,
        openPreview,
        openPreviewInNewTab,
        setActivePreviewTab,
        closePreviewTab,
        reorderPreviewTabs,
        closePreview,
        openFile
    }
}
