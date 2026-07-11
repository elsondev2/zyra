import { useCallback, useEffect, useRef, useState } from 'react'
import type { DevScopePullRequestSummary } from '@shared/contracts/devscope-api'

type UseCurrentBranchPullRequestArgs = {
    projectPath: string
    currentBranch: string
    enabled?: boolean
}

export function useCurrentBranchPullRequest(args: UseCurrentBranchPullRequestArgs) {
    const { projectPath, currentBranch, enabled = true } = args
    const [pullRequest, setPullRequest] = useState<DevScopePullRequestSummary | null>(null)
    const [loading, setLoading] = useState(false)
    const pullRequestRef = useRef<DevScopePullRequestSummary | null>(null)
    const requestIdRef = useRef(0)

    const refresh = useCallback(async () => {
        const normalizedProjectPath = String(projectPath || '').trim()
        const normalizedBranch = String(currentBranch || '').trim()
        const shouldLoad = enabled && normalizedProjectPath.length > 0 && normalizedBranch.length > 0 && normalizedBranch !== 'HEAD'

        if (!shouldLoad) {
            requestIdRef.current += 1
            pullRequestRef.current = null
            setPullRequest(null)
            setLoading(false)
            return null
        }

        const requestId = ++requestIdRef.current
        setLoading(true)
        try {
            const result = await window.devscope.getCurrentBranchPullRequest(normalizedProjectPath)
            if (requestId !== requestIdRef.current) return null
            if (!result?.success) {
                return pullRequestRef.current
            }

            const nextPullRequest = result.pullRequest ?? null
            pullRequestRef.current = nextPullRequest
            setPullRequest(nextPullRequest)
            return nextPullRequest
        } catch {
            return pullRequestRef.current
        } finally {
            if (requestId === requestIdRef.current) {
                setLoading(false)
            }
        }
    }, [currentBranch, enabled, projectPath])

    useEffect(() => {
        void refresh()
    }, [refresh])

    useEffect(() => {
        pullRequestRef.current = pullRequest
    }, [pullRequest])

    return {
        pullRequest,
        loading,
        refresh,
        setPullRequest
    }
}
