import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import {
    DEFAULT_ASSISTANT_TITLE_MODEL,
    DEFAULT_ASSISTANT_TITLE_MODEL_LABEL,
    MAX_ASSISTANT_AUTO_TITLE_TURNS,
    MIN_ASSISTANT_AUTO_TITLE_TURNS,
    normalizeAssistantAutoTitleTurnInterval
} from '@shared/assistant/title-generation'
import type { AssistantModelInfo } from '@shared/assistant/contracts'
import { useSettings } from '@/lib/settings'
import { loadSettingsModels, readCachedSettingsModels } from './settings-model-catalog-cache'
import {
    SettingsButton,
    SettingsInput,
    SettingsRow,
    SettingsSection,
    SettingsSelect,
    SettingsSwitch
} from './settings-layout'

type ModelOption = Pick<AssistantModelInfo, 'id' | 'label' | 'description'>

function retainSavedModel(options: readonly ModelOption[], savedModel: string): ModelOption[] {
    if (!savedModel || options.some((model) => model.id === savedModel)) return [...options]
    return [{ id: savedModel, label: `${savedModel} (saved)` }, ...options]
}

function uniqueModels(options: readonly ModelOption[]): ModelOption[] {
    return options.filter((model, index) => options.findIndex((candidate) => candidate.id === model.id) === index)
}

export function ProviderModelSettings() {
    const { settings, updateSettings } = useSettings()
    const initialModels = useMemo(() => readCachedSettingsModels(), [])
    const [models, setModels] = useState<ModelOption[]>(initialModels)
    const [modelsLoading, setModelsLoading] = useState(false)
    const [modelsResolved, setModelsResolved] = useState(initialModels.length > 0)
    const [modelsError, setModelsError] = useState<string | null>(null)

    const loadModels = useCallback(async (forceRefresh = false) => {
        setModelsLoading(true)
        setModelsError(null)
        try {
            setModels(await loadSettingsModels(forceRefresh))
        } catch (error) {
            setModelsError(error instanceof Error ? error.message : 'Could not load assistant models.')
        } finally {
            setModelsResolved(true)
            setModelsLoading(false)
        }
    }, [])

    useEffect(() => {
        void loadModels(false)
    }, [loadModels])

    const defaultModelOptions = useMemo(
        () => retainSavedModel(models, settings.assistantDefaultModel),
        [models, settings.assistantDefaultModel]
    )
    const titleModelOptions = useMemo(() => uniqueModels(retainSavedModel([
        { id: DEFAULT_ASSISTANT_TITLE_MODEL, label: DEFAULT_ASSISTANT_TITLE_MODEL_LABEL },
        ...models
    ], settings.assistantTitleModel)), [models, settings.assistantTitleModel])
    const savedDefaultUnavailable = Boolean(
        modelsResolved
        && settings.assistantDefaultModel
        && !models.some((model) => model.id === settings.assistantDefaultModel)
    )
    const savedTitleUnavailable = Boolean(
        modelsResolved
        && settings.assistantTitleModel
        && settings.assistantTitleModel !== DEFAULT_ASSISTANT_TITLE_MODEL
        && !models.some((model) => model.id === settings.assistantTitleModel)
    )
    const catalogStatus = modelsError ? 'Catalog unavailable' : modelsLoading ? 'Checking' : null

    return (
        <>
            <SettingsSection
                title="Chat models"
                searchSection="Assistant defaults"
                headerAction={<SettingsButton variant="ghost" onClick={() => void loadModels(true)} disabled={modelsLoading}><RefreshCw size={12} className={modelsLoading ? 'animate-spin' : ''} />Refresh</SettingsButton>}
            >
                <SettingsRow
                    title="Model"
                    description="Choose the default model for new chats."
                    status={catalogStatus || (savedDefaultUnavailable ? 'Saved model unavailable' : null)}
                    statusTone={modelsError || savedDefaultUnavailable ? 'warning' : 'muted'}
                    statusTitle={modelsError || undefined}
                    control={(
                        <SettingsSelect value={settings.assistantDefaultModel} onChange={(event) => updateSettings({ assistantDefaultModel: event.target.value })} aria-label="Default assistant model">
                            <option value="">Provider default</option>
                            {defaultModelOptions.map((model) => <option key={model.id} value={model.id}>{model.label || model.id}</option>)}
                        </SettingsSelect>
                    )}
                />
                <SettingsRow title="Reasoning effort" description="Set the default reasoning depth for compatible models." control={<SettingsSelect value={settings.assistantDefaultEffort} onChange={(event) => updateSettings({ assistantDefaultEffort: event.target.value as typeof settings.assistantDefaultEffort })} aria-label="Default reasoning effort">{['off', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map((effort) => <option key={effort} value={effort}>{effort === 'xhigh' ? 'Extra high' : effort.charAt(0).toUpperCase() + effort.slice(1)}</option>)}</SettingsSelect>} />
                <SettingsRow title="Fast service tier" description="Request priority processing for new chats." info="Only supported providers can honor the priority tier." control={<SettingsSwitch checked={settings.assistantDefaultFastMode} onCheckedChange={(assistantDefaultFastMode) => updateSettings({ assistantDefaultFastMode })} label="Fast service tier" />} />
            </SettingsSection>

            <SettingsSection title="Automatic titles" searchSection="Assistant defaults">
                <SettingsRow
                    title="Chat title model"
                    description="Names new chats without adding the title request to the conversation."
                    status={savedTitleUnavailable ? 'Saved model unavailable' : null}
                    statusTone="warning"
                    control={(
                        <SettingsSelect value={settings.assistantTitleModel} onChange={(event) => updateSettings({ assistantTitleModel: event.target.value })} aria-label="Chat title model">
                            {titleModelOptions.map((model) => <option key={model.id} value={model.id}>{model.label || model.id}</option>)}
                        </SettingsSelect>
                    )}
                />
                <SettingsRow
                    title="Refresh chat titles"
                    description="Refresh chat titles periodically using one title-model request."
                    status={settings.assistantTitleAutoRegenerate ? 'On' : 'Off'}
                    statusTone={settings.assistantTitleAutoRegenerate ? 'ready' : 'muted'}
                    control={<SettingsSwitch checked={settings.assistantTitleAutoRegenerate} onCheckedChange={(assistantTitleAutoRegenerate) => updateSettings({ assistantTitleAutoRegenerate })} label="Automatically refresh chat titles" />}
                />
                {settings.assistantTitleAutoRegenerate ? (<SettingsRow
                    title="Title refresh interval"
                    description={`Update after at least ${MIN_ASSISTANT_AUTO_TITLE_TURNS} completed turns.`}
                    control={(
                        <div className="flex items-center gap-2">
                            <SettingsInput
                                type="number"
                                min={MIN_ASSISTANT_AUTO_TITLE_TURNS}
                                max={MAX_ASSISTANT_AUTO_TITLE_TURNS}
                                value={settings.assistantTitleAutoRegenerateTurns}
                                disabled={!settings.assistantTitleAutoRegenerate}
                                onChange={(event) => updateSettings({ assistantTitleAutoRegenerateTurns: normalizeAssistantAutoTitleTurnInterval(event.target.value) })}
                                className="sm:w-20"
                                aria-label="Completed turns between title refreshes"
                            />
                            <span className="text-[10px] text-[var(--settings-text-muted)]">turns</span>
                        </div>
                    )}
                />) : null}
            </SettingsSection>
        </>
    )
}
