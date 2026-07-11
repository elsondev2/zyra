import { useCallback, useEffect, useRef, useState } from 'react'
import type { PreviewFile } from './types'
import {
    createPythonPreviewSessionId,
    PYTHON_OUTPUT_MAX_CHARS,
    PYTHON_OUTPUT_MIN_HEIGHT,
    type PythonOutputEntry,
    type PythonOutputSource
} from './modalShared'

type UseFilePreviewPythonParams = {
    canRunPython: boolean
    file: PreviewFile
    projectPath?: string
    mode: 'preview' | 'edit'
    isDirty: boolean
    defaultRunMode: 'terminal' | 'output'
    handleSave: () => Promise<boolean>
    queueTerminalCommand: (command: string) => void
    defaultShell: string
}

export function useFilePreviewPython({
    canRunPython,
    file,
    projectPath,
    mode,
    isDirty,
    defaultRunMode,
    handleSave,
    queueTerminalCommand,
    defaultShell
}: UseFilePreviewPythonParams) {
    const [pythonSessionId, setPythonSessionId] = useState(() => createPythonPreviewSessionId())
    const [pythonRunState, setPythonRunState] = useState<'idle' | 'running' | 'success' | 'failed' | 'stopped'>('idle')
    const [pythonRunMode, setPythonRunMode] = useState<'terminal' | 'output'>(defaultRunMode)
    const [pythonOutputEntries, setPythonOutputEntries] = useState<PythonOutputEntry[]>([])
    const [pythonInterpreter, setPythonInterpreter] = useState('')
    const [pythonCommand, setPythonCommand] = useState('')
    const [pythonStopRequested, setPythonStopRequested] = useState(false)
    const [pythonOutputVisible, setPythonOutputVisible] = useState(false)
    const [pythonOutputHeight, setPythonOutputHeight] = useState(160)
    const [pythonShowTimestamps, setPythonShowTimestamps] = useState(false)
    const [isResizingPythonOutput, setIsResizingPythonOutput] = useState(false)

    const pythonOutputScrollRef = useRef<HTMLDivElement | null>(null)
    const outputResizeRef = useRef<{ startY: number; startHeight: number } | null>(null)
    const pythonOutputSequenceRef = useRef(1)
    const pythonSessionIdRef = useRef(pythonSessionId)

    useEffect(() => {
        pythonSessionIdRef.current = pythonSessionId
    }, [pythonSessionId])

    useEffect(() => {
        setPythonRunMode(defaultRunMode)
    }, [defaultRunMode])

    useEffect(() => {
        setPythonSessionId(createPythonPreviewSessionId())
        setPythonRunState('idle')
        setPythonRunMode(defaultRunMode)
        setPythonOutputEntries([])
        setPythonInterpreter('')
        setPythonCommand('')
        setPythonStopRequested(false)
        setPythonOutputVisible(false)
        setPythonOutputHeight(160)
        setPythonShowTimestamps(false)
        pythonOutputSequenceRef.current = 1
    }, [defaultRunMode, file.path, projectPath])

    const appendPythonOutput = useCallback((source: PythonOutputSource, chunk: string) => {
        if (!chunk) return
        setPythonOutputEntries((previous) => {
            const nextEntry: PythonOutputEntry = {
                id: pythonOutputSequenceRef.current++,
                source,
                text: chunk,
                at: Date.now()
            }
            const next = [...previous, nextEntry]

            let totalChars = next.reduce((sum, entry) => sum + entry.text.length, 0)
            while (totalChars > PYTHON_OUTPUT_MAX_CHARS && next.length > 1) {
                const removed = next.shift()
                totalChars -= removed?.text.length || 0
            }

            if (totalChars > PYTHON_OUTPUT_MAX_CHARS && next.length === 1) {
                const only = next[0]
                next[0] = {
                    ...only,
                    text: only.text.slice(Math.max(0, only.text.length - PYTHON_OUTPUT_MAX_CHARS))
                }
            }

            return next
        })
        setPythonOutputVisible(true)
    }, [])

    const buildTerminalPythonCommand = useCallback(() => {
        if (defaultShell === 'cmd') {
            const escapedPath = file.path.replace(/"/g, '""')
            return `where py >nul 2>nul && py -3 "${escapedPath}" || (where python >nul 2>nul && python "${escapedPath}" || (where python3 >nul 2>nul && python3 "${escapedPath}" || echo [Zyra] Python not found in PATH.))`
        }

        const escapedPath = file.path.replace(/'/g, "''")
        return `$__zyraPy='${escapedPath}'; if (Get-Command py -ErrorAction SilentlyContinue) { py -3 $__zyraPy } elseif (Get-Command python -ErrorAction SilentlyContinue) { python $__zyraPy } elseif (Get-Command python3 -ErrorAction SilentlyContinue) { python3 $__zyraPy } else { Write-Host '[Zyra] Python not found in PATH.' -ForegroundColor Red }`
    }, [defaultShell, file.path])

    const runPythonPreviewOutput = useCallback(async () => {
        if (!canRunPython || !file.path || pythonRunState === 'running') return

        if (mode === 'edit' && isDirty) {
            const saved = await handleSave()
            if (!saved) {
                appendPythonOutput('system', '[Zyra] Save failed. Run cancelled.\n')
                return
            }
        }

        setPythonRunState('running')
        setPythonStopRequested(false)
        setPythonOutputVisible(true)
        const nextSessionId = createPythonPreviewSessionId()
        pythonSessionIdRef.current = nextSessionId
        setPythonSessionId(nextSessionId)
        appendPythonOutput('system', `[Zyra] Running ${file.name}...\n`)

        const result = await window.devscope.runPythonPreview({
            sessionId: nextSessionId,
            filePath: file.path,
            projectPath
        })

        if (!result?.success) {
            setPythonRunState('failed')
            appendPythonOutput('system', `[Zyra] Failed to start Python run: ${result?.error || 'Unknown error'}\n`)
            return
        }

        if (typeof result.interpreter === 'string') setPythonInterpreter(result.interpreter)
        if (typeof result.command === 'string') setPythonCommand(result.command)
    }, [appendPythonOutput, canRunPython, file.name, file.path, handleSave, isDirty, mode, projectPath, pythonRunState])

    const runPythonInTerminal = useCallback(async () => {
        if (!canRunPython || !file.path) return

        if (mode === 'edit' && isDirty) {
            const saved = await handleSave()
            if (!saved) {
                appendPythonOutput('system', '[Zyra] Save failed. Run cancelled.\n')
                return
            }
        }

        queueTerminalCommand(`${buildTerminalPythonCommand()}\r`)
    }, [appendPythonOutput, buildTerminalPythonCommand, canRunPython, file.path, handleSave, isDirty, mode, queueTerminalCommand])

    const handleRunPython = useCallback(async () => {
        if (pythonRunMode === 'terminal') {
            await runPythonInTerminal()
            return
        }
        await runPythonPreviewOutput()
    }, [pythonRunMode, runPythonInTerminal, runPythonPreviewOutput])

    const stopPythonRun = useCallback(async () => {
        if (!canRunPython || pythonRunState !== 'running') return false
        setPythonStopRequested(true)
        const result = await window.devscope.stopPythonPreview(pythonSessionIdRef.current)
        if (!result?.success) {
            appendPythonOutput('system', `[Zyra] Failed to stop run: ${result?.error || 'Unknown error'}\n`)
            setPythonStopRequested(false)
            return false
        }
        return true
    }, [appendPythonOutput, canRunPython, pythonRunState])

    const clearPythonOutput = useCallback(() => {
        setPythonOutputEntries([])
        setPythonOutputVisible(false)
        if (pythonRunState !== 'running') {
            setPythonRunState('idle')
        }
    }, [pythonRunState])

    useEffect(() => {
        if (!canRunPython) return

        const unsubscribe = window.devscope.onPythonPreviewEvent((eventPayload) => {
            if (!eventPayload || eventPayload.sessionId !== pythonSessionIdRef.current) return

            if (eventPayload.type === 'started') {
                setPythonRunState('running')
                setPythonStopRequested(false)
                if (typeof eventPayload.interpreter === 'string') setPythonInterpreter(eventPayload.interpreter)
                if (typeof eventPayload.command === 'string') setPythonCommand(eventPayload.command)
                appendPythonOutput(
                    'system',
                    `[Zyra] Process started${typeof eventPayload.pid === 'number' ? ` (pid ${eventPayload.pid})` : ''}\n`
                )
                return
            }

            if (eventPayload.type === 'stdout' || eventPayload.type === 'stderr') {
                appendPythonOutput(eventPayload.type, String(eventPayload.text || ''))
                return
            }

            if (eventPayload.type === 'error') {
                setPythonRunState('failed')
                appendPythonOutput('system', `[Zyra] ${String(eventPayload.text || 'Runtime error')}\n`)
                return
            }

            if (eventPayload.type === 'exit') {
                const wasStopped = Boolean(eventPayload.stopped) || pythonStopRequested
                if (wasStopped) setPythonRunState('stopped')
                else if (eventPayload.code === 0) setPythonRunState('success')
                else setPythonRunState('failed')
                setPythonStopRequested(false)
                const codeLabel = typeof eventPayload.code === 'number' ? `${eventPayload.code}` : 'null'
                appendPythonOutput(
                    'system',
                    `\n[Zyra] Process exited with code ${codeLabel}${eventPayload.signal ? ` (signal ${eventPayload.signal})` : ''}\n`
                )
            }
        })

        return () => unsubscribe()
    }, [appendPythonOutput, canRunPython, pythonStopRequested])

    useEffect(() => {
        if (!canRunPython) return
        return () => {
            void window.devscope.stopPythonPreview(pythonSessionIdRef.current).catch(() => undefined)
        }
    }, [canRunPython, file.path])

    useEffect(() => {
        const outputNode = pythonOutputScrollRef.current
        if (!outputNode) return
        outputNode.scrollTop = outputNode.scrollHeight
    }, [pythonOutputEntries])

    const startPythonOutputResize = useCallback((event: { preventDefault: () => void; clientY: number }) => {
        event.preventDefault()
        outputResizeRef.current = { startY: event.clientY, startHeight: pythonOutputHeight }
        setIsResizingPythonOutput(true)
    }, [pythonOutputHeight])

    useEffect(() => {
        if (!isResizingPythonOutput) return

        const applyDragState = (active: boolean) => {
            if (active) {
                document.documentElement.style.setProperty('cursor', 'row-resize', 'important')
                document.documentElement.style.setProperty('user-select', 'none', 'important')
                document.body.style.setProperty('cursor', 'row-resize', 'important')
                document.body.style.setProperty('user-select', 'none', 'important')
                return
            }

            document.documentElement.style.removeProperty('cursor')
            document.documentElement.style.removeProperty('user-select')
            document.body.style.removeProperty('cursor')
            document.body.style.removeProperty('user-select')
        }

        const maxHeight = Math.max(180, Math.floor(window.innerHeight * 0.7))
        const clamp = (value: number) => Math.min(maxHeight, Math.max(PYTHON_OUTPUT_MIN_HEIGHT, value))
        const onMove = (event: MouseEvent) => {
            const resize = outputResizeRef.current
            if (!resize) return
            const delta = resize.startY - event.clientY
            setPythonOutputHeight(clamp(resize.startHeight + delta))
        }

        const stop = () => {
            outputResizeRef.current = null
            setIsResizingPythonOutput(false)
            applyDragState(false)
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', stop)
        }

        applyDragState(true)
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', stop)
        return stop
    }, [isResizingPythonOutput])

    return {
        pythonRunState,
        pythonRunMode,
        setPythonRunMode,
        pythonOutputEntries,
        pythonInterpreter,
        pythonCommand,
        pythonOutputVisible,
        pythonOutputHeight,
        pythonShowTimestamps,
        setPythonShowTimestamps,
        pythonOutputScrollRef,
        handleRunPython,
        stopPythonRun,
        clearPythonOutput,
        startPythonOutputResize
    }
}
