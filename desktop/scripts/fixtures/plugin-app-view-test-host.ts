import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'

declare const __TEST_VIEW_SCRIPT__: string
declare global { interface Window { zyraAppViewTestStatus?: string } }

const iframe = document.createElement('iframe')
iframe.id = 'sandbox'
iframe.setAttribute('sandbox', 'allow-scripts')
iframe.src = './mcp-app-sandbox.html'
iframe.style.cssText = 'width:600px;height:400px;border:0'
document.body.append(iframe)

iframe.addEventListener('load', async () => {
    window.zyraAppViewTestStatus = 'iframe-loaded'
    if (!iframe.contentWindow) throw new Error('Sandbox frame did not load.')
    const bridge = new AppBridge(null, { name: 'Zyra test host', version: '1.0.0' }, { serverTools: {} })
    bridge.oninitialized = () => {
        bridge.sendToolInput({ arguments: {} })
        bridge.sendToolResult({ content: [{ type: 'text', text: 'initial result' }] })
        window.zyraAppViewTestStatus = 'ready'
    }
    bridge.oncalltool = async ({ name }) => {
        if (name !== 'refresh') throw new Error('Unexpected tool')
        window.zyraAppViewTestStatus = 'called'
        return { content: [{ type: 'text', text: 'refreshed result' }] }
    }
    try {
    await bridge.connect(new PostMessageTransport(iframe.contentWindow, iframe.contentWindow))
    window.zyraAppViewTestStatus = 'bridge-connected'
    await bridge.sendSandboxResourceReady({
        html: `<div id="status">Loading</div><button id="call">Call</button><script>${__TEST_VIEW_SCRIPT__}</script>`,
        csp: { connectDomains: [], resourceDomains: [] },
        sandbox: 'allow-scripts'
    })
    window.zyraAppViewTestStatus = 'resource-sent'
    } catch (error) { window.zyraAppViewTestStatus = `error: ${String(error)}` }
})
