import { useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RendererErrorBoundary as Guard } from '../../src/renderer/src/components/layout/RendererErrorBoundary'

// Replays a browser-state update that throws inside the application tree.
let failBrowser: () => void
let failureMode: 'render' | 'layout' = 'render'
function BrowserState() {
    const [failed, setFailed] = useState(false)
    failBrowser = () => setFailed(true)
    useLayoutEffect(() => {
        if (failed && failureMode === 'layout') throw new Error('Synthetic browser presentation failure')
    }, [failed])
    if (failed && failureMode === 'render') throw new Error('Synthetic browser state failure')
    return <div>Chat interface</div>
}
let developmentTools = 0
;(window as any).zyraKeybindings = { command: async () => { developmentTools++; return true } }
const container = document.getElementById('root')!
createRoot(container).render(<Guard><BrowserState /></Guard>)
const pause = () => new Promise(resolve => setTimeout(resolve, 30))
;(window as any).rendererFailureCheck = (async () => {
    await pause()
    failBrowser!()
    await pause()
    if (!container.querySelector('[role="alert"]')) throw new Error('Renderer failure leaves the whole app blank instead of presenting recovery')
    if (!container.textContent?.includes('Synthetic browser state failure')) throw new Error('Failure details must remain inspectable without shortcuts')
    const buttons = [...container.querySelectorAll('button')]
    buttons.find(button => button.textContent === 'Developer tools')!.click()
    await pause()
    if (developmentTools !== 1) throw new Error('Recovery can open native Developer tools')
    buttons.find(button => button.textContent === 'Retry interface')!.click()
    await pause()
    if (!container.textContent?.includes('Chat interface')) throw new Error('Retry remounts the interface without reloading the app or cancelling the agent')
    failureMode = 'layout'
    failBrowser!()
    await pause()
    if (!container.querySelector('[role="alert"]') || !container.textContent?.includes('Synthetic browser presentation failure')) throw new Error('Native browser layout-effect errors must also preserve recovery')
    return ['render failure has a visible recovery screen and error details', 'Developer tools works from recovery', 'retry remounts only the interface', 'browser layout-effect failure also preserves recovery']
})()
