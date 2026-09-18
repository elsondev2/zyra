import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
const read = (path: string) => readFileSync(new URL(`../src/renderer/src/${path}`, import.meta.url), 'utf8')
const css = read('index.css')
assert.match(css, /details::details-content/, 'native Settings disclosures have a shared animation')
assert.match(css, /interpolate-size: allow-keywords/)
assert.match(css, /content-visibility 220ms allow-discrete/)
assert.match(css, /prefers-reduced-motion: reduce[\s\S]*details::details-content/)
assert.match(css, /zyra-reduce-motion[\s\S]*details::details-content/)
const shell = read('pages/settings/SettingsShell.tsx')
assert.match(shell, /data-settings-search-opening/, 'exact search reveal preserves immediate target layout')
const { SettingsExpander } = await import('../src/renderer/src/pages/settings/SettingsExpander')
const closed = renderToStaticMarkup(<SettingsExpander open={false}><button>Advanced action</button></SettingsExpander>)
assert.match(closed, /aria-hidden="true"/); assert.match(closed, /inert=""/); assert.doesNotMatch(closed, /Advanced action/)
assert.match(renderToStaticMarkup(<SettingsExpander open><button>Advanced action</button></SettingsExpander>), /Advanced action/)
const { availableProviderAddChoices } = await import('../src/renderer/src/pages/settings/providers/provider-add-options')
assert.deepEqual(availableProviderAddChoices([], false, false).map(option => option.id), ['openai-codex', 'openai', 'opencode', 'anthropic', 'custom'])
assert.deepEqual(availableProviderAddChoices(['opencode', 'custom-example'], true, false).map(option => option.id), ['openai', 'anthropic', 'custom'])
assert.deepEqual(availableProviderAddChoices(['opencode', 'anthropic'], true, true).map(option => option.id), ['custom'], 'another custom endpoint stays available')
const { ProviderAddPicker } = await import('../src/renderer/src/pages/settings/providers/ProviderAddPicker')
const choices = availableProviderAddChoices([], true, false)
const picker = renderToStaticMarkup(<ProviderAddPicker choices={choices} onSelect={() => {}} />)
assert.doesNotMatch(picker, /ChatGPT subscription/)
assert.match(picker, /OpenAI API/)
assert.match(picker, /Claude API/)
const { OpenAIConnectionRows } = await import('../src/renderer/src/pages/settings/providers/OpenAIConnectionRows')
const noop = () => {}
const connection = {
    desktopHost: true, connectionError: null, connectionAction: null, connectionBusy: false,
    chatGptConnection: { configured: true, verified: true }, apiKeyConnection: { configured: false, verified: false },
    activeDefaultMethod: 'chatgpt', apiKeyDialogOpen: false, apiKeyDraft: '', disconnectMethod: null,
    setApiKeyDialogOpen: noop, setApiKeyDraft: noop, setDisconnectMethod: noop, refreshAll: noop, connectChatGpt: noop, connectApiKey: noop, switchDefaultConnection: noop, disconnect: noop
} as unknown as Parameters<typeof OpenAIConnectionRows>[0]['connection']
const visibleRows = renderToStaticMarkup(<OpenAIConnectionRows connection={connection} />)
assert.match(visibleRows, /ChatGPT subscription/)
assert.doesNotMatch(visibleRows, /OpenAI API key|Add key|Not connected/)
const needsAttention = renderToStaticMarkup(<OpenAIConnectionRows connection={{ ...connection, chatGptConnection: { ...connection.chatGptConnection!, verified: false } }} />)
assert.match(needsAttention, /Needs attention/, 'saved connections remain recoverable after a failed health check')
const rows = read('pages/settings/providers/OpenAIConnectionRows.tsx')
assert.match(rows, /chatGptConnection\?\.configured \? \(/)
assert.match(rows, /apiKeyConnection\?\.configured \? \(/)
assert.match(rows, /<SettingsDialog\s+open=\{apiKeyDialogOpen\}/, 'the key dialog survives while its absent row is hidden')
const providers = read('pages/settings/ModelProviderConnections.tsx')
assert.match(providers, /data-add-provider-row="true"/)
assert.match(providers, /<ProviderAddPicker/)
assert.match(providers, /initialProvider=\{addProvider\}/)
const owner = read('pages/settings/providers/ProviderConnections.tsx')
assert.match(owner, /onAddChatGpt=\{connection\.connectChatGpt\}/)
assert.match(owner, /onAddOpenAiKey=\{\(\) => connection\.setApiKeyDialogOpen\(true\)\}/)
console.log('Settings disclosure/provider flow: native motion, reduced motion, safe closed state, missing-provider choices and existing auth wiring: ok')
