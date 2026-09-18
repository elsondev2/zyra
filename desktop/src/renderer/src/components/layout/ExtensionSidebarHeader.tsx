import { useEffect, useState } from 'react'
import { Menu, Plus, Square, Settings2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useRuntimeConnection } from '@/lib/runtime-connection'
import { useAssistantStoreActions } from '@/lib/assistant/store'
import { createAssistantChatAndNavigate } from '@/pages/assistant/create-assistant-chat-and-navigate'
import { extensionRequest, setExtensionTab, subscribeExtension, type ExtensionTab, type ExtensionConnectionState } from '@/lib/browser-extension'
export function ExtensionSidebarHeader() {
    const navigate = useNavigate()
    const runtime = useRuntimeConnection()
    const actions = useAssistantStoreActions()
    const [tab, setTab] = useState<ExtensionTab | null>(null)
    const [state, setState] = useState<ExtensionConnectionState | null>(null)
    const [error, setError] = useState('')
    const selectCurrentTab = async () => {
        try {
            const next = await extensionRequest<ExtensionTab | null>('current-tab')
            if (!next || !/^https?:/.test(next.url || '')) throw new Error('Open a website to use it with Zyra.')
            if (state?.browserShared) await extensionRequest('release')
            else if (tab && tab.id !== next.id) await extensionRequest('release', {tabId:tab.id})
            setTab(next); setExtensionTab(next); setError('')
        } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not select this tab.') }
    }
    useEffect(() => { void selectCurrentTab(); const unsubscribe = subscribeExtension(setState); return () => { unsubscribe(); setExtensionTab(null) } }, [])
    const stop = async () => {
        try { await extensionRequest('release', state?.browserShared ? {} : tab ? {tabId:tab.id} : {}); setTab(null); setExtensionTab(null) }
        catch (reason) { setError(String(reason)) }
    }
    return <header className="extension-header">
        <div className="extension-header-actions">
            <button title="Chats" aria-label="Chats" onClick={() => window.dispatchEvent(new Event('zyra:toggle-assistant-sidebar'))}><Menu size={17}/></button>
            <span style={{ color: `var(--status-${runtime.tone})` }} title={`${runtime.label} · ${runtime.detail}`}>Zyra</span><span className="extension-connection-state">{runtime.label} · {runtime.detail}</span>
            <button title="New chat" aria-label="New chat" onClick={() => void createAssistantChatAndNavigate(actions, navigate).then(result => { if (!result.success) setError(result.error) }).catch(reason => setError(String(reason)))}><Plus size={17}/></button>
            <button title="Browser access and settings" aria-label="Browser access and settings" onClick={() => void extensionRequest('open-console')}><Settings2 size={16}/></button>
        </div>
        <div className="extension-tab-context"><select aria-label="Browser access scope" value={state?.browserShared ? 'browser' : 'tab'} onChange={event => {
            if (event.target.value === 'browser') void extensionRequest('share-browser').catch(reason => setError(String(reason)))
            else void selectCurrentTab()
        }}><option value="tab">This tab</option><option value="browser">This browser</option></select><button title="Use the current tab" onClick={() => void selectCurrentTab()}>{state?.browserShared ? state.browserName || 'Chrome' : tab?.title || 'Select current tab'}</button><button title="Release tab access" aria-label="Release tab access" disabled={!tab && !state?.browserShared} onClick={() => void stop()}><Square size={12}/></button></div>
        {error && <p role="alert">{error}</p>}
    </header>
}
