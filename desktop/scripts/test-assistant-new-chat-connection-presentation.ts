import assert from 'node:assert/strict'
import { resolveAssistantComposerConnectionPresentation } from '../src/renderer/src/pages/assistant/assistant-conversation-surface-mode'

assert.deepEqual(resolveAssistantComposerConnectionPresentation({
    connected: false,
    hasComposerSession: false,
    newChatHandoffActive: true,
    selectedSessionUsesNewChatSurface: false
}), {
    connected: true,
    connecting: false,
    reconnectPending: false
}, 'a New Chat handoff must not flash Disconnected before its draft session exists')

assert.deepEqual(resolveAssistantComposerConnectionPresentation({
    connected: false,
    hasComposerSession: true,
    newChatHandoffActive: false,
    selectedSessionUsesNewChatSurface: true
}), {
    connected: true,
    connecting: false,
    reconnectPending: false
}, 'a pristine New Chat is immediately usable without a provider attachment')

assert.deepEqual(resolveAssistantComposerConnectionPresentation({
    connected: false,
    hasComposerSession: false,
    newChatHandoffActive: false,
    selectedSessionUsesNewChatSurface: false,
    connecting: false,
    reconnectPending: false
}), {
    connected: false,
    connecting: false,
    reconnectPending: false
}, 'a genuine disconnected established chat must still expose its reconnect state')

console.log('Assistant New Chat connection presentation: ok')
