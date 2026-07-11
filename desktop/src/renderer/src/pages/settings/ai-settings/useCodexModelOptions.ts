import { useEffect, useMemo, useState } from 'react'
import type { ModelOption } from './aiSettingsConfig'

export function useCodexModelOptions(effectiveCodexModels: string[]) {
    const [codexModelOptions, setCodexModelOptions] = useState<ModelOption[]>([])
    const [codexModelsError, setCodexModelsError] = useState('')

    useEffect(() => {
        let cancelled = false

        async function loadCodexModels() {
            try {
                const result = await window.devscope.assistant.listModels(false)
                if (!result.success) {
                    throw new Error(result.error || 'Failed to load Codex models.')
                }
                if (cancelled) return
                setCodexModelOptions(Array.isArray(result.models) ? result.models : [])
                setCodexModelsError('')
            } catch (error) {
                if (!cancelled) {
                    setCodexModelOptions([])
                    setCodexModelsError(error instanceof Error ? error.message : 'Failed to load Codex models.')
                }
            }
        }

        void loadCodexModels()
        return () => {
            cancelled = true
        }
    }, [])

    const resolvedCodexModelOptions = useMemo(() => {
        const options = [...codexModelOptions]
        const currentValues = Array.from(new Set(
            (effectiveCodexModels || [])
                .map((value) => String(value || '').trim())
                .filter(Boolean)
        ))

        for (const currentValue of currentValues.reverse()) {
            if (!options.some((option) => option.id === currentValue)) {
                options.unshift({ id: currentValue, label: currentValue, description: 'Currently selected model' })
            }
        }
        if (options.length === 0) {
            options.push({ id: '', label: 'Default Codex model' })
        } else if (!options.some((option) => option.id === '')) {
            options.unshift({ id: '', label: 'Default Codex model' })
        }
        return options
    }, [codexModelOptions, effectiveCodexModels])

    return {
        codexModelsError,
        resolvedCodexModelOptions
    }
}
