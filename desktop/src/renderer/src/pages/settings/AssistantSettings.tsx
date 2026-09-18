import { SPEAKING_STYLES } from '@shared/assistant/speaking-style'
import { useState } from 'react'
import { useSettings } from '@/lib/settings'
import { SettingsPageTabs } from './SettingsPageTabs'
import { ChatAccessSettings } from './PermissionsSettings'
import {
    SettingsButton,
    SettingsDialog,
    SettingsPageContainer,
    SettingsRow,
    SettingsSection,
    SettingsSegmented,
    SettingsSelect,
    SettingsSwitch,
    SettingsTextarea
} from './settings-layout'

export type AssistantSettingsView = 'behavior' | 'display'

export default function AssistantSettings({ view = 'behavior' }: { view?: AssistantSettingsView }) {
    return (
        <SettingsPageContainer title="Chats" navigation={<SettingsPageTabs family="chats" />}>
            {view === 'behavior' ? <ChatBehaviorSettings /> : <ChatDisplaySettings />}
        </SettingsPageContainer>
    )
}

function ChatBehaviorSettings() {
    const { settings, updateSettings } = useSettings()
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

    return (
        <>
            <SettingsSection title="Chat behavior" searchSection="Assistant defaults">
                <SettingsRow
                    title="Speaking style"
                    description="Set Zyra's tone without changing its tools or abilities."
                    control={<SettingsSegmented value={settings.assistantProductProfile} options={SPEAKING_STYLES.map((style) => ({ ...style }))} onChange={(assistantProductProfile) => updateSettings({ assistantProductProfile })} label="Speaking style" />}
                />
                <SettingsRow title="Busy send behavior" description="Choose what Send does while the current turn is still active." control={<SettingsSegmented value={settings.assistantBusyMessageMode} options={[{ value: 'queue', label: 'Queue next' }, { value: 'force', label: 'Interrupt' }]} onChange={(assistantBusyMessageMode) => updateSettings({ assistantBusyMessageMode })} label="Busy send behavior" />} />
                <SettingsRow
                    title="Default prompt"
                    description="Prefill the composer when you start a new chat."
                    info="The draft is not sent until you submit it."
                    status={settings.assistantDefaultPromptTemplate.trim() ? 'Custom prompt saved' : 'No default prompt'}
                    statusTone={settings.assistantDefaultPromptTemplate.trim() ? 'ready' : 'muted'}
                    control={<SettingsButton onClick={openPromptTemplate}>Edit prompt</SettingsButton>}
                />
            </SettingsSection>

            <ChatAccessSettings />

            <SettingsDialog
                open={promptTemplateOpen}
                title="Edit default prompt"
                description="This text is placed into the composer when a new chat starts."
                onClose={() => setPromptTemplateOpen(false)}
                footer={(
                    <>
                        <SettingsButton variant="ghost" onClick={() => setPromptTemplateOpen(false)}>Cancel</SettingsButton>
                        <SettingsButton variant="accent" onClick={savePromptTemplate}>Save prompt</SettingsButton>
                    </>
                )}
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
    )
}

function ChatDisplaySettings() {
    const { settings, updateSettings } = useSettings()

    return (
        <>
            <SettingsSection title="Reasoning" searchSection="Reasoning and context">
                <SettingsRow
                    title="Reasoning summaries"
                    description="Show readable progress summaries from reasoning models."
                    info="Detailed summaries still exclude private chain-of-thought."
                    control={(
                        <SettingsSelect
                            value={settings.assistantReasoningSummary}
                            onChange={(event) => updateSettings({ assistantReasoningSummary: event.target.value as typeof settings.assistantReasoningSummary })}
                            aria-label="Reasoning summaries"
                        >
                            <option value="auto">Auto</option>
                            <option value="detailed">Detailed</option>
                            <option value="concise">Concise</option>
                        </SettingsSelect>
                    )}
                />
            </SettingsSection>

            <SettingsSection title="Conversation display" searchSection="Output and history">
                <SettingsRow title="Collapse ongoing work" description="Allow hiding the work block while the agent is still working." control={<SettingsSwitch checked={settings.assistantAllowCollapseWhileWorking} onCheckedChange={(assistantAllowCollapseWhileWorking) => updateSettings({ assistantAllowCollapseWhileWorking })} label="Allow collapsing ongoing work" />} />
                <SettingsRow title="Action statistics" description="Show response durations, activity timings and action counts." info="Off by default. When off, timings appear only inside individual actions you expand." control={<SettingsSwitch checked={settings.assistantShowActionStats} onCheckedChange={(assistantShowActionStats) => updateSettings({ assistantShowActionStats })} label="Show action statistics" />} />
                <SettingsRow title="Chat display" description="Choose a quiet conversation view or the full activity treatment." control={<SettingsSegmented value={settings.assistantChatDisplayMode} options={[{ value: 'minimal', label: 'Minimal' }, { value: 'detailed', label: 'Detailed' }]} onChange={(assistantChatDisplayMode) => updateSettings({ assistantChatDisplayMode })} label="Chat display" />} />
                <SettingsRow title="Assistant output" description="Show token-by-token output or grouped chunks while a response is generated." control={<SettingsSegmented value={settings.assistantTextStreamingMode} options={[{ value: 'stream', label: 'Live stream' }, { value: 'chunks', label: 'Chunks' }]} onChange={(assistantTextStreamingMode) => updateSettings({ assistantTextStreamingMode })} label="Assistant output mode" />} />
                <SettingsRow title="Open live tool output" description="Expand tool output automatically while actions run." control={<SettingsSwitch checked={settings.assistantToolOutputDefaultMode === 'expanded'} onCheckedChange={(enabled) => updateSettings({ assistantToolOutputDefaultMode: enabled ? 'expanded' : 'minimized' })} label="Automatically open live tool output" />} />
                <SettingsRow title="Cross-surface status" description="Show when this chat is open or running in another Zyra client." control={<SettingsSwitch checked={settings.assistantShowStatusDetails} onCheckedChange={(assistantShowStatusDetails) => updateSettings({ assistantShowStatusDetails })} label="Show cross-surface status" />} />
            </SettingsSection>
        </>
    )
}
