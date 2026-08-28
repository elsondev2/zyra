import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
    buildAssistantChatRoute,
    parseAssistantChatRoute
} from '../src/renderer/src/pages/assistant/assistant-chat-route'

const sessionId = 'assistant-session:abc/123'
const threadId = 'assistant-thread:main value'
const route = buildAssistantChatRoute(sessionId, threadId)
assert.equal(
    route,
    '/assistant/chat/assistant-session%3Aabc%2F123/thread/assistant-thread%3Amain%20value',
    'chat URLs must safely encode stable session and thread identities'
)
assert.deepEqual(
    parseAssistantChatRoute(route),
    { kind: 'chat', sessionId, threadId },
    'a browser refresh must recover the exact chat and thread from its URL'
)
assert.deepEqual(
    parseAssistantChatRoute('/assistant/chat/assistant-session%3Aabc'),
    { kind: 'chat', sessionId: 'assistant-session:abc', threadId: null },
    'session-only chat links remain valid and canonicalize after loading'
)
assert.deepEqual(parseAssistantChatRoute('/assistant'), { kind: 'assistant-root' })
assert.deepEqual(parseAssistantChatRoute('/assistant/dev/full-chat'), { kind: 'reserved' }, 'browser design fixtures must retain their dedicated URLs')
assert.deepEqual(parseAssistantChatRoute('/settings/account'), { kind: 'outside-assistant' })

const appSource = readFileSync(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')
const pageSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantPage.tsx', import.meta.url), 'utf8')
const connectedRailSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantConnectedSessionsRail.tsx', import.meta.url), 'utf8')
const browserAssistantSource = readFileSync(new URL('../src/renderer/src/lib/browser-assistant-bridge-adapter.ts', import.meta.url), 'utf8')
const assistantStoreSource = readFileSync(new URL('../src/renderer/src/lib/assistant/assistant-store-core.ts', import.meta.url), 'utf8')
const createAndNavigateSource = readFileSync(new URL('../src/renderer/src/pages/assistant/create-assistant-chat-and-navigate.ts', import.meta.url), 'utf8')
assert.equal(appSource.includes('<Route path="/assistant/*"'), true, 'deep chat URLs must remain inside the Assistant route')
assert.equal(pageSource.includes('useAssistantChatRouting'), true, 'Assistant selection must synchronize with browser history')
assert.equal(connectedRailSource.includes('navigate(buildAssistantChatRoute(sessionId'), true, 'chat clicks must update the URL immediately instead of waiting for backend selection')
assert.equal(connectedRailSource.includes('navigate(buildAssistantChatRoute(input.sessionId, input.threadId))'), true, 'thread clicks must receive their own URL immediately')
assert.equal(connectedRailSource.includes('createAssistantChatAndNavigate(railController, navigate)'), true, 'New Chat must route from the returned session identity instead of waiting for shared selection')
assert.equal(createAndNavigateSource.includes('navigate(buildAssistantChatRoute(result.sessionId'), true, 'newly created browser chats must receive a stable URL before the old route can reclaim selection')
const directSessionSelectionIndex = connectedRailSource.indexOf('void railController.selectSession(sessionId)')
const sessionNavigationIndex = connectedRailSource.indexOf('navigate(buildAssistantChatRoute(sessionId')
assert.ok(directSessionSelectionIndex >= 0 && directSessionSelectionIndex < sessionNavigationIndex, 'chat clicks synchronously select the cached target before committing its one browser-history entry')
const directThreadSelectionIndex = connectedRailSource.indexOf('void railController.selectThread(input)')
const threadNavigationIndex = connectedRailSource.indexOf('navigate(buildAssistantChatRoute(input.sessionId, input.threadId))')
assert.ok(directThreadSelectionIndex >= 0 && directThreadSelectionIndex < threadNavigationIndex, 'sub-thread clicks synchronously select their cached target before route synchronization')
assert.equal(connectedRailSource.includes('await railController.selectSession'), false, 'sidebar selection never waits for authoritative IPC before navigation')
assert.equal(connectedRailSource.includes('await railController.selectThread'), false, 'sub-thread selection never waits for authoritative IPC before navigation')
assert.equal(browserAssistantSource.includes('projectBrowserRouteSnapshot'), true, 'a cold browser deep link must survive bootstrap selection from Desktop')
assert.equal(browserAssistantSource.includes('bootstrap: getBrowserBootstrap'), true, 'browser bootstrap must project its stable route before the store hydrates')
assert.equal(assistantStoreSource.includes('claimBrowserRoutedConnection'), true, 'browser stream reconnects must reclaim the routed session after the lease activates')
assert.equal(assistantStoreSource.includes('window.devscope.assistant.connect({ sessionId })'), true, 'thread routes must reconnect the selected session so Back and Forward remain usable')

console.log('Assistant chat routing: ok')
