import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { RendererErrorBoundary } from './components/layout/RendererErrorBoundary'
import { startBrowserViewStateTracking } from './lib/browser-view-state'
import '@fontsource-variable/jetbrains-mono/wght.css'
import './index.css'

async function bootstrapRenderer() {
    if (!window.devscope) {
        const { installBrowserDevscopeAdapter } = await import('./lib/browser-devscope-adapter')
        installBrowserDevscopeAdapter()
    }

    startBrowserViewStateTracking()
    ReactDOM.createRoot(document.getElementById('root')!).render(
        <React.StrictMode>
            <RendererErrorBoundary><App /></RendererErrorBoundary>
        </React.StrictMode>
    )
}

void bootstrapRenderer()
