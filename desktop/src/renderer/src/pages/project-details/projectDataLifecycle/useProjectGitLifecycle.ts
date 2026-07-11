import { useEffect, useRef } from 'react'
import type { GitStatusDetail } from '../types'
import type { UseProjectGitLifecycleParams } from './types'
import { useProjectGitAutoRefresh } from './useProjectGitAutoRefresh'
import { useProjectGitCacheLifecycle } from './useProjectGitCacheLifecycle'
import { useProjectGitRefresh } from './useProjectGitRefresh'

export function useProjectGitLifecycle(params: UseProjectGitLifecycleParams) {
    const refreshGitForegroundRequestRef = useRef(0)
    const refreshGitBackgroundRequestRef = useRef(0)
    const refreshGitDataRef = useRef<((refreshFilesToo?: boolean, options?: { quiet?: boolean; mode?: 'working' | 'history' | 'unpushed' | 'pulls' | 'full' }) => Promise<void>) | null>(null)
    const gitStatusDetailsRef = useRef<GitStatusDetail[]>(params.gitStatusDetails)
    const gitSensorTokenRef = useRef<string | null>(null)
    const previousGitTabStateRef = useRef({
        activeTab: params.activeTab,
        decodedPath: params.decodedPath,
        gitView: params.gitView
    })

    useEffect(() => {
        gitStatusDetailsRef.current = params.gitStatusDetails
    }, [params.gitStatusDetails])

    const refreshGitData = useProjectGitRefresh(params, {
        refreshGitForegroundRequestRef,
        refreshGitBackgroundRequestRef,
        gitStatusDetailsRef,
        gitSensorTokenRef
    })

    useEffect(() => {
        refreshGitDataRef.current = refreshGitData
    }, [refreshGitData])

    useProjectGitCacheLifecycle(params, gitSensorTokenRef)
    useProjectGitAutoRefresh(params, {
        refreshGitData,
        refreshGitDataRef,
        previousGitTabStateRef,
        gitSensorTokenRef
    })

    return { refreshGitData }
}
