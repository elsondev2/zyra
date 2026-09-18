import { useCallback, useRef, useEffect, useState } from 'react'

export function useAccessoryDirectory(initialPath: string, onError: (message: string) => void) {
    const [path, setPath] = useState(initialPath)
    const [choosing, setChoosing] = useState(false)
    const mounted = useRef(true)
    useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
    const choose = useCallback(async () => {
        if (choosing) return
        setChoosing(true)
        try {
            const result = await window.devscope.selectFolder()
            if (!mounted.current) return
            if (!result.success) throw Error(result.error || 'Could not choose a folder.')
            if (result.folderPath) setPath(result.folderPath)
        } catch (cause) { if (mounted.current) onError(cause instanceof Error ? cause.message : 'Could not choose a folder.') }
        finally { if (mounted.current) setChoosing(false) }
    }, [choosing, onError])
    return { path, choosing, choose }
}
