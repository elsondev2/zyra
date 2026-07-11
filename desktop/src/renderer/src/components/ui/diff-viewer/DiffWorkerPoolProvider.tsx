import { useMemo, type ReactNode } from 'react'
import { WorkerPoolContextProvider } from '@pierre/diffs/react'
import DiffsWorker from '@pierre/diffs/worker/worker.js?worker'
import { resolveDiffThemeName } from '@/lib/diffRendering'
import { useSettings } from '@/lib/settings'

export function DiffWorkerPoolProvider({ children }: { children: ReactNode }) {
    const { settings } = useSettings()
    const diffThemeName = resolveDiffThemeName(settings.theme)
    const poolSize = useMemo(() => {
        if (typeof navigator === 'undefined') return 2
        const cores = navigator.hardwareConcurrency || 4
        return Math.min(6, Math.max(2, Math.ceil(cores / 2)))
    }, [])

    return (
        <WorkerPoolContextProvider
            key={diffThemeName}
            poolOptions={{
                workerFactory: () => new DiffsWorker(),
                poolSize,
                totalASTLRUCacheSize: 240
            }}
            highlighterOptions={{
                theme: diffThemeName,
                lineDiffType: 'none',
                preferredHighlighter: 'shiki-js',
                tokenizeMaxLineLength: 1000
            }}
        >
            {children}
        </WorkerPoolContextProvider>
    )
}
