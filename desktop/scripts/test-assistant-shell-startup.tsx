import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { AssistantRouteShell } from '../src/renderer/src/pages/assistant/AssistantRouteShell'
import {
    ASSISTANT_MAX_LEFT_SIDEBAR_WIDTH,
    ASSISTANT_MIN_LEFT_SIDEBAR_WIDTH,
    resolveStoredAssistantLeftSidebarWidth
} from '../src/renderer/src/pages/assistant/assistant-pane-layout'

assert.equal(resolveStoredAssistantLeftSidebarWidth(null), 322)
assert.equal(resolveStoredAssistantLeftSidebarWidth('999'), ASSISTANT_MAX_LEFT_SIDEBAR_WIDTH)
assert.equal(resolveStoredAssistantLeftSidebarWidth('10'), ASSISTANT_MIN_LEFT_SIDEBAR_WIDTH)

const expandedShell = renderToStaticMarkup(<AssistantRouteShell sidebarCollapsed={false} sidebarWidth={322} />)
assert.match(expandedShell, /data-assistant-route-shell="true"/)
assert.match(expandedShell, /width:322px/)
assert.match(expandedShell, /Opening chat workspace/)
assert.match(expandedShell, /data-assistant-shell-sidebar="true"/)
assert.match(expandedShell, /data-assistant-shell-timeline="true"/)
assert.match(expandedShell, /data-assistant-shell-composer="true"/)
assert.match(expandedShell, /h-\[136px\]/, 'the shell composer should match the loaded bottom composer height')
assert.match(expandedShell, /max-w-\[760px\]/, 'the shell composer should match the loaded composer width')
assert.equal(expandedShell.includes('animate-'), false, 'the immediate Assistant shell must enter without motion')

const inboxShell = renderToStaticMarkup(<AssistantRouteShell sidebarCollapsed={false} sidebarWidth={322} agentInboxEnabled />)
assert.match(inboxShell, /data-assistant-shell-sidebar="true"/, 'the inbox shell should preserve the loaded sidebar frame')

const collapsedShell = renderToStaticMarkup(<AssistantRouteShell sidebarCollapsed sidebarWidth={322} />)
assert.match(collapsedShell, /width:0/)

const appSource = readFileSync(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')
assert.equal(appSource.includes('const loadAssistantRoute = () => import'), true, 'Assistant remains a separately cached route chunk')
assert.equal(appSource.includes('window.requestIdleCallback(preload'), true, 'the Assistant route preloads before navigation when the browser is idle')
assert.equal(appSource.includes('<AssistantRouteShell'), true, 'cold navigation paints the Assistant-shaped shell immediately')
assert.equal(appSource.includes('agentInboxEnabled={settings.assistantAgentInboxSidebarEnabled}'), true, 'the fallback sidebar must match the selected loaded sidebar mode')
assert.equal(appSource.includes('<Route path="/assistant" element={<AssistantRoute />}'), true)

const routeShellSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantRouteShell.tsx', import.meta.url), 'utf8')
assert.equal(routeShellSource.includes('usePublishAssistantTitleBarContent(titleBarContent)'), true, 'the fallback should preserve the loaded title-bar content region')
assert.equal(/bg-\[var\([^\]]+\)\]\/\d+/.test(routeShellSource), false, 'shell fills cannot use invalid opacity modifiers on CSS variables')
assert.equal(routeShellSource.includes('flex h-12 shrink-0 items-center border-b'), false, 'the fallback cannot add an internal header absent from the loaded page')

const pageSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantPage.tsx', import.meta.url), 'utf8')
assert.equal(pageSource.includes("default: (await import('./AssistantDiffPanel')).AssistantDiffPanel"), true, 'closed Inspector code stays out of the initial chat chunk')
assert.equal(pageSource.includes('const [inspectorMounted, setInspectorMounted]'), false, 'a closed Inspector cannot remain mounted behind the chat')
assert.equal(pageSource.includes('requestIdleCallback(warm'), false, 'opening Assistant cannot evaluate the Inspector chunk during startup idle time')
assert.match(pageSource, /\{inspectorOpen \? \(\s*<Suspense/, 'the Inspector mounts only after the user opens it')
assert.equal(pageSource.includes("lazy(() => import('@/components/ui/FilePreviewModal'))"), true, 'closed File Preview code stays out of the initial chat chunk')
assert.equal(
    pageSource.includes('overflow-hidden animate-fadeIn [--accent-primary'),
    false,
    'the Assistant shell must not fade upward independently from the title bar'
)

const titleBarSource = readFileSync(new URL('../src/renderer/src/components/layout/TitleBar.tsx', import.meta.url), 'utf8')
assert.equal(titleBarSource.includes('resolveStoredAssistantLeftSidebarWidth'), true, 'title bar and sidebar start with the same persisted width')
assert.equal(titleBarSource.includes('useState(settings.sidebarCollapsed)'), true, 'title bar and sidebar start with the same collapsed state')

const titleBarBridgeSource = readFileSync(new URL('../src/renderer/src/lib/assistant/assistant-title-bar.tsx', import.meta.url), 'utf8')
assert.equal(
    titleBarBridgeSource.includes('AssistantTitleBarPublicationContext'),
    true,
    'title-bar publishers must use a publication-only context so their own updates cannot trigger a render loop'
)
const contentPublisherSource = titleBarBridgeSource.slice(
    titleBarBridgeSource.indexOf('export function usePublishAssistantTitleBarContent'),
    titleBarBridgeSource.indexOf('export function usePublishAssistantTitleBarEndRegion')
)
assert.equal(
    contentPublisherSource.includes('useContext(AssistantTitleBarPublicationContext)'),
    true,
    'the title-bar content publisher must not subscribe to published title-bar state'
)
const endRegionPublisherSource = titleBarBridgeSource.slice(
    titleBarBridgeSource.indexOf('export function usePublishAssistantTitleBarEndRegion')
)
assert.equal(
    endRegionPublisherSource.includes('useContext(AssistantTitleBarPublicationContext)'),
    true,
    'the title-bar end-region publisher must not subscribe to published title-bar state'
)

console.log('Assistant immediate shell startup: ok')
