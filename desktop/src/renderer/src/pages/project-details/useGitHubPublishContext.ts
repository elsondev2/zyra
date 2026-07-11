import { useEffect, useMemo, useState } from 'react'
import type { DevScopeGitHubPublishContext } from '@shared/contracts/devscope-api'

export function useGitHubPublishContext(args: {
    projectPath: string
    enabled?: boolean
    remoteUrls: string[]
}) {
    const { projectPath, enabled = true, remoteUrls } = args
    const remoteUrlsKey = useMemo(
        () => remoteUrls
            .map((value) => String(value || '').trim())
            .filter(Boolean)
            .sort()
            .join('|'),
        [remoteUrls]
    )
    const [context, setContext] = useState<DevScopeGitHubPublishContext | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string>('')

    useEffect(() => {
        let cancelled = false

        if (!enabled || !projectPath.trim() || remoteUrls.length === 0) {
            setContext(null)
            setError('')
            setLoading(false)
            return
        }

        setLoading(true)
        setError('')

        void window.devscope.getGitHubPublishContext(projectPath)
            .then((result) => {
                if (cancelled) return
                if (!result?.success) {
                    setContext(null)
                    setError(result?.error || 'Failed to load GitHub publish context.')
                    return
                }
                setContext(result.context)
            })
            .catch((err: any) => {
                if (cancelled) return
                setContext(null)
                setError(err?.message || 'Failed to load GitHub publish context.')
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false)
                }
            })

        return () => {
            cancelled = true
        }
    }, [enabled, projectPath, remoteUrlsKey])

    const refresh = async () => {
        if (!enabled || !projectPath.trim()) return null
        setLoading(true)
        setError('')
        try {
            const result = await window.devscope.getGitHubPublishContext(projectPath)
            if (!result?.success) {
                throw new Error(result?.error || 'Failed to load GitHub publish context.')
            }
            setContext(result.context)
            return result.context
        } catch (err: any) {
            setError(err?.message || 'Failed to load GitHub publish context.')
            return null
        } finally {
            setLoading(false)
        }
    }

    return {
        context,
        loading,
        error,
        refresh
    }
}
