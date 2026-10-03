import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { PluginAppView } from '../../src/renderer/src/pages/assistant/PluginAppView'
import { pluginAppViewIdentity } from '../../src/renderer/src/pages/assistant/plugin-app-view-state'

declare const __TEST_VIEW_SCRIPT__: string
const root = createRoot(document.getElementById('root')!)
const view = { displayMode: 'manual' as const, threadId: 'fixture', pluginId: 'fixture', server: 'Fixture', tool: 'fixture',
    uri: 'ui://fixture/view', arguments: {}, result: { content: [{ type: 'text', text: 'initial result' }] } }
Object.assign(window, {
    devscope: { assistant: {
        readPluginAppView: async (input: { uri: string }) => { Object.assign(window, { lastRequestedUri: input.uri }); return ({ success: true, view: {
            html: `<div id="status">Loading</div><button id="call">Call</button><script>${__TEST_VIEW_SCRIPT__}</script>`,
            csp: { connectDomains: [], resourceDomains: [] },
        } }) },
        callPluginAppViewTool: async () => ({ success: true, result: { content: [{ type: 'text', text: 'refreshed result' }] } }),
    } },
    unmountFixture: () => flushSync(() => root.unmount()),
    replaceViewFixture: (uri: string) => { const next = { ...view, uri }; flushSync(() => root.render(createElement(PluginAppView, { key: pluginAppViewIdentity(next), view: next }))) },
})
flushSync(() => root.render(createElement(PluginAppView, { key: pluginAppViewIdentity(view), view })))
