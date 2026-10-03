import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { AssistantModelInfo, AssistantRuntimeMode } from '@shared/assistant/contracts'
import { useSettings } from '@/lib/settings'
import { loadSettingsModels, readCachedSettingsModels, subscribeSettingsModels } from './settings-model-catalog-cache'
import { ChatDefaultModelPicker } from './ChatDefaultModelPicker'
import { SettingsButton, SettingsDialog, SettingsRow, SettingsSection, SettingsSegmented, SettingsSelect, SettingsSwitch, SettingsTextarea } from './settings-layout'

type ModelOption = Pick<AssistantModelInfo, 'id' | 'label' | 'description'>


export function ChatDefaultsSettings() {
    const { settings, updateSettings } = useSettings()
    const initialModels = useMemo(() => readCachedSettingsModels(), [])
    const [models, setModels] = useState<ModelOption[]>(initialModels)
    const [modelsLoading, setModelsLoading] = useState(false)
    const [modelsResolved, setModelsResolved] = useState(initialModels.length > 0)
    const [modelsError, setModelsError] = useState<string | null>(null)
    const [promptTemplateOpen, setPromptTemplateOpen] = useState(false)
    const [promptTemplateDraft, setPromptTemplateDraft] = useState(settings.assistantDefaultPromptTemplate)

    const openPromptTemplate = () => {
        setPromptTemplateDraft(settings.assistantDefaultPromptTemplate)
        setPromptTemplateOpen(true)
    }

    const savePromptTemplate = () => {
        updateSettings({ assistantDefaultPromptTemplate: promptTemplateDraft })
        setPromptTemplateOpen(false)
    }

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
        const unsubscribe = subscribeSettingsModels(next => { setModels(next); setModelsResolved(true); setModelsError(null) })
        void loadModels(false)
        return unsubscribe
    }, [loadModels])

    const defaultModelOptions = useMemo(
        () => models,
        [models]
    )
    const savedDefaultUnavailable = Boolean(
        modelsResolved
        && settings.assistantDefaultModel
        && !models.some((model) => model.id === settings.assistantDefaultModel)
    )
    const catalogStatus = modelsError ? 'Catalog unavailable' : modelsLoading ? 'Checking' : null

    return <><SettingsSection
        title="Chat models"
        searchSection="Chat defaults"
        headerAction={<SettingsButton variant="ghost" onClick={() => void loadModels(true)} disabled={modelsLoading}><RefreshCw size={12} className={modelsLoading ? 'animate-spin' : ''} />Refresh</SettingsButton>}
    >
        <SettingsRow
            title="Model"
            description="Choose the default model for new chats."
            status={catalogStatus || (savedDefaultUnavailable ? 'Saved model unavailable' : null)}
            statusTone={modelsError || savedDefaultUnavailable ? 'warning' : 'muted'}
            statusTitle={modelsError || undefined}
            control={(
                <ChatDefaultModelPicker value={settings.assistantDefaultModel} models={defaultModelOptions} onValueChange={(assistantDefaultModel) => updateSettings({ assistantDefaultModel })} />
            )}
        />
        <SettingsRow title="Reasoning effort" description="Set the default reasoning depth for compatible models." control={<SettingsSelect value={settings.assistantDefaultEffort} onChange={(event) => updateSettings({ assistantDefaultEffort: event.target.value as typeof settings.assistantDefaultEffort })} aria-label="Default reasoning effort">{['off', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map((effort) => <option key={effort} value={effort}>{effort === 'xhigh' ? 'Extra high' : effort.charAt(0).toUpperCase() + effort.slice(1)}</option>)}</SettingsSelect>} />
        <SettingsRow title="Fast service tier" description="Request priority processing for new chats." info="Only supported providers can honor the priority tier." control={<SettingsSwitch checked={settings.assistantDefaultFastMode} onCheckedChange={(assistantDefaultFastMode) => updateSettings({ assistantDefaultFastMode })} label="Fast service tier" />} />
    </SettingsSection>
        <SettingsSection title="New chat setup" searchSection="Assistant defaults">
            <SettingsRow
                title="Default prompt"
                description="Prefill the composer when you start a new chat."
                info="The draft is not sent until you submit it."
                status={settings.assistantDefaultPromptTemplate.trim() ? 'Custom prompt saved' : 'No default prompt'}
                statusTone={settings.assistantDefaultPromptTemplate.trim() ? 'ready' : 'muted'}
                control={<SettingsButton onClick={openPromptTemplate}>Edit prompt</SettingsButton>}
            />
            <SettingsRow
                title="Permission mode"
                description="Set the approval rules used when a new chat starts."
                info="Applies to chat tools, the Browser, paired Chrome and computer use."
                control={(
                    <SettingsSelect
                        value={settings.assistantDefaultRuntimeMode}
                        onChange={(event) => updateSettings({ assistantDefaultRuntimeMode: event.target.value as AssistantRuntimeMode })}
                        aria-label="Default permission mode"
                    >
                        <option value="approval-required">Supervised</option>
                        <option value="auto-review">Auto review</option>
                        <option value="edits-only">Edits only</option>
                        <option value="full-access">Full access</option>
                    </SettingsSelect>
                )}
            />
            <SettingsRow title="Busy send behavior" description="Choose what Send does while the current turn is still active." control={<SettingsSegmented value={settings.assistantBusyMessageMode} options={[{ value: 'queue', label: 'Queue next' }, { value: 'force', label: 'Interrupt' }]} onChange={(assistantBusyMessageMode) => updateSettings({ assistantBusyMessageMode })} label="Busy send behavior" />} />
        </SettingsSection>
        <SettingsDialog
            open={promptTemplateOpen}
            title="Edit default prompt"
            description="This text is placed into the composer when a new chat starts."
            onClose={() => setPromptTemplateOpen(false)}
            footer={<>
                <SettingsButton variant="ghost" onClick={() => setPromptTemplateOpen(false)}>Cancel</SettingsButton>
                <SettingsButton variant="accent" onClick={savePromptTemplate}>Save prompt</SettingsButton>
            </>}
        >
            <SettingsTextarea
                autoFocus
                value={promptTemplateDraft}
                maxLength={32_000}
                rows={10}
                onChange={(event) => setPromptTemplateDraft(event.target.value)}
                placeholder="Optional instructions for new chats"
                aria-label="Default assistant prompt template"
            />
            <div className="text-right text-[10px] tabular-nums text-[var(--settings-text-muted)]">{promptTemplateDraft.length.toLocaleString()} / 32,000</div>
        </SettingsDialog>
    </>
}
