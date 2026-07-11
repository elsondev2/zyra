import React from 'react'
import ReactDOM from 'react-dom/client'
import { installBrowserDevscopeAdapter } from './lib/browser-devscope-adapter'
import App from './App'
import './index.css'

installBrowserDevscopeAdapter()

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
)
