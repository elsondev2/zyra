import { useEffect } from 'react'

type UseProjectLiveStatusLifecycleParams = {
    projectPath: string | null | undefined
    setIsProjectLive: (value: boolean) => void
    setActivePorts: (value: number[]) => void
}

export function useProjectLiveStatusLifecycle({
    projectPath,
    setIsProjectLive,
    setActivePorts
}: UseProjectLiveStatusLifecycleParams): void {
    useEffect(() => {
        const checkProjectStatus = async () => {
            if (!projectPath || document.visibilityState !== 'visible') return

            try {
                const processResult = await window.devscope.getProjectProcesses(projectPath)
                if (processResult.success) {
                    setIsProjectLive(processResult.isLive)
                    setActivePorts(processResult.activePorts || [])
                }
            } catch (e) {
                console.error('[ProjectDetails] Failed to check project status:', e)
            }
        }

        void checkProjectStatus()
        const interval = window.setInterval(() => void checkProjectStatus(), 15_000)
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') void checkProjectStatus()
        }
        document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true })
        return () => {
            window.clearInterval(interval)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [projectPath, setIsProjectLive, setActivePorts])
}
