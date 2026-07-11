import { useMemo, useState } from 'react'
import {
    appendScriptArgsForRunner,
    applyShellEnvOverrides,
    buildServerCliArgs,
    detectPackageScriptRunner,
    detectScriptIntentWithConfidence,
    getScriptCommand,
    parseEnvOverrideInput,
    type ScriptIntent,
    type ScriptIntentContext,
    type ScriptIntentPrediction,
    type ScriptRunDraft,
    type PackageScriptRunnerPreference
} from './scriptRun'
import type { PendingScriptRun, ProjectDetails } from './types'

interface UseScriptRunModalParams {
    project: ProjectDetails | null
    defaultShell: 'powershell' | 'cmd'
    packageRuntimePreference: PackageScriptRunnerPreference
    openTerminal: (tool: { id: string; category: string; displayName: string }, cwd: string, command?: string) => void
}

interface UseScriptRunModalResult {
    scriptRunner: ReturnType<typeof detectPackageScriptRunner>
    scriptIntentContext: ScriptIntentContext
    scriptPredictions: Record<string, ScriptIntentPrediction>
    pendingScriptRun: PendingScriptRun | null
    scriptPortInput: string
    setScriptPortInput: (value: string) => void
    scriptExposeNetwork: boolean
    setScriptExposeNetwork: (value: boolean) => void
    scriptAdvancedOpen: boolean
    setScriptAdvancedOpen: (value: boolean) => void
    scriptExtraArgsInput: string
    setScriptExtraArgsInput: (value: string) => void
    scriptEnvInput: string
    setScriptEnvInput: (value: string) => void
    scriptRunError: string | null
    setScriptRunError: (value: string | null) => void
    runScript: (scriptName: string, command: string) => void
    closeScriptRunModal: () => void
    handleConfirmScriptRun: () => void
    scriptCommandPreview: string
}

export function useScriptRunModal({
    project,
    defaultShell,
    packageRuntimePreference,
    openTerminal
}: UseScriptRunModalParams): UseScriptRunModalResult {
    const [pendingScriptRun, setPendingScriptRun] = useState<PendingScriptRun | null>(null)
    const [scriptPortInput, setScriptPortInput] = useState('')
    const [scriptExposeNetwork, setScriptExposeNetwork] = useState(false)
    const [scriptAdvancedOpen, setScriptAdvancedOpen] = useState(false)
    const [scriptExtraArgsInput, setScriptExtraArgsInput] = useState('')
    const [scriptEnvInput, setScriptEnvInput] = useState('')
    const [scriptRunError, setScriptRunError] = useState<string | null>(null)

    const scriptRunner = useMemo(
        () => detectPackageScriptRunner(project?.markers || [], packageRuntimePreference),
        [packageRuntimePreference, project?.markers]
    )

    const scriptIntentContext = useMemo<ScriptIntentContext>(
        () => ({
            frameworks: project?.frameworks || [],
            markers: project?.markers || []
        }),
        [project?.frameworks, project?.markers]
    )

    const scriptPredictions = useMemo(() => {
        const predictions: Record<string, ScriptIntentPrediction> = {}
        if (!project?.scripts) return predictions
        Object.entries(project.scripts).forEach(([name, command]) => {
            predictions[name] = detectScriptIntentWithConfidence(name, command, scriptIntentContext)
        })
        return predictions
    }, [project?.scripts, scriptIntentContext])

    const closeScriptRunModal = () => {
        setPendingScriptRun(null)
        setScriptRunError(null)
        setScriptAdvancedOpen(false)
    }

    const launchScriptInTerminal = (scriptName: string, commandToRun: string) => {
        if (!project) return
        openTerminal(
            {
                id: `script-${scriptName}`,
                category: 'system',
                displayName: `Run: ${scriptName}`
            },
            project.path,
            commandToRun
        )
    }

    const buildScriptCommandWithOverrides = (
        scriptName: string,
        scriptIntent: ScriptIntent,
        options: ScriptRunDraft = {},
        scriptCommand: string = ''
    ) => {
        const baseCommand = getScriptCommand(scriptName, scriptRunner)
        const envOverrides: Record<string, string> = { ...(options.envOverrides || {}) }
        const intentArgs: string[] = []

        if (scriptIntent === 'server' && options.port) {
            const port = String(options.port)
            envOverrides.PORT = port
            envOverrides.DEV_PORT = port
            envOverrides.VITE_PORT = port
        }

        if (scriptIntent === 'server' && options.exposeNetwork) {
            envOverrides.HOST = '0.0.0.0'
            envOverrides.HOSTNAME = '0.0.0.0'
            envOverrides.BIND_ADDR = '0.0.0.0'
        }

        if (scriptIntent === 'server') {
            intentArgs.push(...buildServerCliArgs(scriptCommand, options))
        }

        if (options.extraArgs?.trim()) {
            intentArgs.push(options.extraArgs.trim())
        }

        const commandWithArgs = appendScriptArgsForRunner(baseCommand, intentArgs.join(' '), scriptRunner)
        return applyShellEnvOverrides(commandWithArgs, defaultShell, envOverrides)
    }

    const getScriptRunDraftFromState = (
        scriptIntent: ScriptIntent,
        strictValidation: boolean
    ): { draft: ScriptRunDraft; error?: string } => {
        const draft: ScriptRunDraft = {}

        const envParseResult = parseEnvOverrideInput(scriptEnvInput)
        if (envParseResult.error && strictValidation) {
            return { draft, error: envParseResult.error }
        }
        if (Object.keys(envParseResult.envOverrides).length > 0) {
            draft.envOverrides = envParseResult.envOverrides
        }

        const extraArgs = scriptExtraArgsInput.trim()
        if (extraArgs) {
            draft.extraArgs = extraArgs
        }

        if (scriptIntent === 'server') {
            const rawPort = scriptPortInput.trim()
            if (rawPort) {
                const maybePort = Number(rawPort)
                if (!Number.isInteger(maybePort) || maybePort < 1 || maybePort > 65535) {
                    if (strictValidation) {
                        return { draft, error: 'Port must be a number between 1 and 65535.' }
                    }
                } else {
                    draft.port = maybePort
                }
            }

            if (scriptExposeNetwork) {
                draft.exposeNetwork = true
            }
        }

        return { draft }
    }

    const runScript = (scriptName: string, command: string) => {
        if (!project) return

        const prediction = scriptPredictions[scriptName] || detectScriptIntentWithConfidence(scriptName, command, scriptIntentContext)
        if (prediction.intent !== 'server') {
            const commandToRun = buildScriptCommandWithOverrides(scriptName, prediction.intent, {}, command)
            launchScriptInTerminal(scriptName, commandToRun)
            return
        }

        setPendingScriptRun({
            name: scriptName,
            command,
            intent: prediction.intent,
            confidence: prediction.confidence
        })
        setScriptPortInput('')
        setScriptExposeNetwork(false)
        setScriptAdvancedOpen(false)
        setScriptExtraArgsInput('')
        setScriptEnvInput('')
        setScriptRunError(null)
    }

    const handleConfirmScriptRun = () => {
        if (!pendingScriptRun) return

        const draftResult = getScriptRunDraftFromState(pendingScriptRun.intent, true)
        if (draftResult.error) {
            setScriptRunError(draftResult.error)
            return
        }

        const commandToRun = buildScriptCommandWithOverrides(
            pendingScriptRun.name,
            pendingScriptRun.intent,
            draftResult.draft,
            pendingScriptRun.command
        )

        launchScriptInTerminal(pendingScriptRun.name, commandToRun)
        closeScriptRunModal()
    }

    const scriptCommandPreview = pendingScriptRun
        ? buildScriptCommandWithOverrides(
            pendingScriptRun.name,
            pendingScriptRun.intent,
            getScriptRunDraftFromState(pendingScriptRun.intent, false).draft,
            pendingScriptRun.command
        )
        : ''

    return {
        scriptRunner,
        scriptIntentContext,
        scriptPredictions,
        pendingScriptRun,
        scriptPortInput,
        setScriptPortInput,
        scriptExposeNetwork,
        setScriptExposeNetwork,
        scriptAdvancedOpen,
        setScriptAdvancedOpen,
        scriptExtraArgsInput,
        setScriptExtraArgsInput,
        scriptEnvInput,
        setScriptEnvInput,
        scriptRunError,
        setScriptRunError,
        runScript,
        closeScriptRunModal,
        handleConfirmScriptRun,
        scriptCommandPreview
    }
}
