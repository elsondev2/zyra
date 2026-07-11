import { useCallback, useRef } from 'react'
import { getCachedFileTree, getCachedProjectDetails, setCachedProjectDetails } from '@/lib/projectViewCache'
import type { FileTreeNode } from '../types'
import type { UseProjectDataLifecycleParams } from './types'
import { yieldToBrowserPaint } from './gitLifecycleUtils'

type UseProjectDetailsLoaderParams = Pick<
    UseProjectDataLifecycleParams,
    'decodedPath' | 'setLoading' | 'setError' | 'setProject' | 'setFileTree' | 'setLoadingFiles'
>

export function useProjectDetailsLoader({
    decodedPath,
    setLoading,
    setError,
    setProject,
    setFileTree,
    setLoadingFiles
}: UseProjectDetailsLoaderParams) {
    const loadDetailsRequestRef = useRef(0)

    const loadProjectDetails = useCallback(async () => {
        if (!decodedPath) return

        const requestId = ++loadDetailsRequestRef.current
        const isStale = () => requestId !== loadDetailsRequestRef.current
        const cachedProject = getCachedProjectDetails(decodedPath)
        const cachedTree = getCachedFileTree(decodedPath)
        const hasCachedProject = Boolean(cachedProject)

        if (cachedProject) {
            setProject(cachedProject as any)
            setError(null)
            setLoading(false)
        } else {
            setLoading(true)
        }
        if (cachedTree) {
            setFileTree(cachedTree as any)
            setLoadingFiles(false)
        } else {
            setFileTree([])
            setLoadingFiles(true)
        }

        setError(null)
        if (!hasCachedProject) {
            await yieldToBrowserPaint()
        }

        try {
            const detailsResult = await window.devscope.getProjectDetails(decodedPath)

            if (isStale()) return

            if (detailsResult.success) {
                setProject(detailsResult.project)
                setCachedProjectDetails(decodedPath, detailsResult.project)
                setError(null)
                setLoading(false)
            } else {
                if (!hasCachedProject) {
                    setError(detailsResult.error || 'Failed to load project details')
                }
                setLoading(false)
            }
        } catch (err: any) {
            if (isStale()) return
            if (!hasCachedProject) {
                setError(err.message || 'Failed to load project')
            }
        } finally {
            if (!isStale() && !hasCachedProject) {
                setLoading(false)
            }
        }
    }, [decodedPath, setLoading, setError, setProject, setFileTree, setLoadingFiles])

    return { loadProjectDetails }
}
