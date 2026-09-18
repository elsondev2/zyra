import { RefreshCw } from 'lucide-react'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { SettingsProviderIcon } from '../SettingsProviderIcon'
import { SettingsActionsMenu } from '../SettingsActionsMenu'
import { SettingsButton, SettingsDialog, SettingsInput, SettingsNotice, SettingsRow } from '../settings-layout'
import { createSettingsRowTargetId } from '../settings-search'
import { connectionStatusLabel, connectionStatusTone, useOpenAIAccountSettings } from './useOpenAIAccountSettings'

export function OpenAIConnectionRows({ connection }: { connection: ReturnType<typeof useOpenAIAccountSettings> }) {
    const { desktopHost, connectionError, connectionAction, apiKeyDialogOpen, setApiKeyDialogOpen, apiKeyDraft, setApiKeyDraft, disconnectMethod, setDisconnectMethod, refreshAll, connectChatGpt, connectApiKey, switchDefaultConnection, disconnect, chatGptConnection, apiKeyConnection, activeDefaultMethod, connectionBusy } = connection
    return <>
                {!desktopHost ? <SettingsNotice tone="neutral">Open Zyra Desktop on this computer to connect, replace, switch, or disconnect OpenAI credentials.</SettingsNotice> : null}
                {connectionError ? <SettingsNotice tone="error">{connectionError}<SettingsButton variant="ghost" disabled={connectionBusy} onClick={() => void refreshAll()}>Retry</SettingsButton></SettingsNotice> : null}
                {!chatGptConnection?.configured && connectionAction === 'chatgpt' ? <SettingsNotice>Waiting for ChatGPT sign-in…</SettingsNotice> : null}
                {chatGptConnection?.configured ? (<SettingsRow
                    title="ChatGPT subscription"
                    searchTargetId={createSettingsRowTargetId('OpenAI connections', 'ChatGPT subscription')}
                    description="Use your subscription for ChatGPT models, Voice and usage limits."
                    icon={<SettingsProviderIcon provider="chatgpt" />}
                    status={desktopHost ? connectionStatusLabel(chatGptConnection) : 'Managed in Desktop'}
                    statusTone={desktopHost ? connectionStatusTone(chatGptConnection) : 'muted'}
                    statusTitle={chatGptConnection?.detail || undefined}
                    control={desktopHost ? (
                        <SettingsActionsMenu label={connectionAction === 'chatgpt' ? 'Waiting…' : 'Manage'} ariaLabel="Manage ChatGPT connection" disabled={connectionBusy} items={[
                            { id: 'reconnect', label: 'Reconnect', onSelect: connectChatGpt },
                            ...(chatGptConnection.verified ? [{ id: 'default', label: 'Use for new chats', checked: activeDefaultMethod === 'chatgpt', disabled: activeDefaultMethod === 'chatgpt', onSelect: () => switchDefaultConnection('chatgpt') }] : []),
                            { id: 'disconnect', label: 'Disconnect', danger: true, separatorBefore: true, onSelect: () => setDisconnectMethod('chatgpt') }
                        ]} />
                    ) : <span className="text-xs text-sparkle-text-muted">Managed in Desktop</span>}
                />) : null}
                {apiKeyConnection?.configured ? (<SettingsRow
                    title="OpenAI API key"
                    searchTargetId={createSettingsRowTargetId('OpenAI connections', 'OpenAI API key')}
                    description="Connect an API key for usage billed to your OpenAI account."
                    info="The key is verified before saving and is never returned to this page."
                    icon={<SettingsProviderIcon provider="openai" />}
                    status={desktopHost ? connectionStatusLabel(apiKeyConnection) : 'Desktop only'}
                    statusTone={desktopHost ? connectionStatusTone(apiKeyConnection) : 'muted'}
                    statusTitle={apiKeyConnection?.detail || undefined}
                    control={desktopHost ? (
                        <SettingsActionsMenu ariaLabel="Manage OpenAI API key" disabled={connectionBusy} items={[
                            { id: 'replace', label: 'Replace key', onSelect: () => setApiKeyDialogOpen(true) },
                            ...(apiKeyConnection.verified ? [{ id: 'default', label: 'Use for new chats', checked: activeDefaultMethod === 'api-key', disabled: activeDefaultMethod === 'api-key', onSelect: () => switchDefaultConnection('api-key') }] : []),
                            { id: 'disconnect', label: 'Remove key', danger: true, separatorBefore: true, onSelect: () => setDisconnectMethod('api-key') }
                        ]} />
                    ) : <span className="text-xs text-sparkle-text-muted">Managed in Desktop</span>}
                />) : null}
            <SettingsDialog
                open={apiKeyDialogOpen}
                title="Connect OpenAI API"
                description="Verify and save the key, or cancel without changing your connection."
                onClose={() => {
                    if (connectionAction === 'api-key') return
                    setApiKeyDraft('')
                    setApiKeyDialogOpen(false)
                }}
                footer={(
                    <>
                        <SettingsButton variant="ghost" disabled={connectionAction === 'api-key'} onClick={() => { setApiKeyDraft(''); setApiKeyDialogOpen(false) }}>Cancel</SettingsButton>
                        <SettingsButton variant="accent" disabled={!apiKeyDraft.trim() || connectionAction === 'api-key'} onClick={() => void connectApiKey()}>
                            {connectionAction === 'api-key' ? <RefreshCw size={12} className="animate-spin motion-reduce:animate-none" /> : null}
                            {connectionAction === 'api-key' ? 'Verifying…' : 'Verify and save'}
                        </SettingsButton>
                    </>
                )}
            >
                <label htmlFor="account-openai-api-key" className="text-[12px] font-medium text-[var(--settings-text)]">API key</label>
                <SettingsInput
                    id="account-openai-api-key"
                    autoFocus
                    type="password"
                    value={apiKeyDraft}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => setApiKeyDraft(event.target.value)}
                    placeholder="sk-…"
                    className="sm:w-full"
                />
            </SettingsDialog>

            <ConfirmModal
                isOpen={disconnectMethod !== null}
                title={disconnectMethod === 'chatgpt' ? 'Disconnect ChatGPT?' : 'Remove OpenAI API key?'}
                message={disconnectMethod === 'chatgpt'
                    ? 'Zyra will remove the ChatGPT OAuth connection from Pi. Completed onboarding stays complete, but ChatGPT models, Voice, usage, and resets will require reconnection.'
                    : 'Zyra will remove the OpenAI API key from Pi. Chats configured for API models may require another working connection.'}
                confirmLabel={connectionAction === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
                variant="warning"
                onCancel={() => {
                    if (connectionAction !== 'disconnect') setDisconnectMethod(null)
                }}
                onConfirm={() => void disconnect()}
            />

    </>
}
