import { useEffect, useState } from 'react'

export function resolveExplorerHomePath(explicitHomePath: string, defaultHomePath: string | null): string {
    const normalizedExplicitHomePath = String(explicitHomePath || '').trim()
    if (normalizedExplicitHomePath) {
        return normalizedExplicitHomePath
    }

    return String(defaultHomePath || '').trim()
}

export function useDefaultExplorerHomePath(): string | null {
    const [defaultHomePath, setDefaultHomePath] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false

        void (async () => {
            try {
                const result = await window.devscope.getUserHomePath()
                if (cancelled) return
                setDefaultHomePath(result.success ? String(result.path || '').trim() : '')
            } catch {
                if (cancelled) return
                setDefaultHomePath('')
            }
        })()

        return () => {
            cancelled = true
        }
    }, [])

    return defaultHomePath
}
