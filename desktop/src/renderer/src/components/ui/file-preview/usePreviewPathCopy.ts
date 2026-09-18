import { useCallback, useEffect, useRef, useState } from 'react'
import { copyPreviewPath } from './copy-preview-path'

export function usePreviewPathCopy(path: string) {
    const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
    const generation = useRef(0)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const clearTimer = useCallback(() => {
        if (timer.current !== null) clearTimeout(timer.current)
        timer.current = null
    }, [])
    useEffect(() => {
        generation.current += 1
        clearTimer()
        setStatus('idle')
        return () => { generation.current += 1; clearTimer() }
    }, [path, clearTimer])
    const copyPath = useCallback(async () => {
        const request = ++generation.current
        clearTimer()
        const success = await copyPreviewPath(path, value => window.devscope.copyToClipboard(value))
        if (request !== generation.current) return
        setStatus(success ? 'copied' : 'failed')
        timer.current = setTimeout(() => { timer.current = null; setStatus('idle') }, 1500)
    }, [path, clearTimer])
    return { copied: status === 'copied', copyFailed: status === 'failed', copyPath }
}
