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
            if (!projectPath) return

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

        checkProjectStatus()
        const interval = setInterval(checkProjectStatus, 3000)
        return () => clearInterval(interval)
    }, [projectPath, setIsProjectLive, setActivePorts])
}
