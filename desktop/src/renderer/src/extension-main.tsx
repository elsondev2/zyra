import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installBrowserDevscopeAdapter } from './lib/browser-devscope-adapter'
import { configureExtensionBrowserHost } from '@shared/browser-assistant-bridge'
import { extensionRequest, type ExtensionConnectionState } from './lib/browser-extension'
import './index.css'
import './styles/extension-sidebar.css'
installBrowserDevscopeAdapter()
document.documentElement.dataset.zyraExtension = 'true'
function ExtensionBoot() {
    const [host, setHost] = useState('')
    const connecting = useRef(false)
    const [error, setError] = useState('')
    const [checking, setChecking] = useState(false)
    const connect = async (resume = false) => {
        if (connecting.current) return
        connecting.current = true
        setChecking(true)
        try {
            const state = await extensionRequest<ExtensionConnectionState>(resume ? 'auto-connect' : 'refresh-connection')
            if (!state.connected) throw new Error(state.connectionPaused ? 'Browser connection is paused. Choose Try again to resume.' : state.lastError || 'Waiting for Zyra Desktop.')
            const origin = state.clientOrigin || 'http://127.0.0.1:47821'
            configureExtensionBrowserHost(origin)
            setHost(origin); setError('')
        }
        catch (reason) { setError(reason instanceof Error ? reason.message : 'Open Zyra Desktop to connect.') }
        finally { connecting.current = false; setChecking(false) }
    }
    useEffect(() => { void connect(); const timer = window.setInterval(() => void connect(), 5000); return () => clearInterval(timer) }, [])
    if (host) return <App key={host} />
    return <main className="extension-connection" aria-busy={checking}>
        <img src="../icon48.png" width="32" height="32" alt="" />
        <h1>Zyra</h1><p>Open Zyra Desktop to chat from your browser.</p>
        {error && <p role="status">{error}</p>}
        <button disabled={checking} onClick={() => void connect(true)}>{checking ? 'Connecting…' : 'Try again'}</button>
    </main>
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ExtensionBoot /></React.StrictMode>)
