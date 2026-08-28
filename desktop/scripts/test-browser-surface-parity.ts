import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const titleBarSource = readFileSync(new URL('../src/renderer/src/components/layout/TitleBar.tsx', import.meta.url), 'utf8')
const inspectorSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantDiffPanel.tsx', import.meta.url), 'utf8')
const browserAdapterSource = readFileSync(new URL('../src/renderer/src/lib/browser-assistant-bridge-adapter.ts', import.meta.url), 'utf8')
const browserHostSource = readFileSync(new URL('../src/main/browser-client-host.ts', import.meta.url), 'utf8')

assert.match(titleBarSource, /\.\.\.\(nativeDesktop \? \[\[/u, 'Chrome must not expose the inert Close window app-menu action')
assert.match(inspectorSource, /\.\.\.\(isElectronRendererRuntime\(\)[\s\S]{0,180}id: 'browser'/u, 'the integrated Browser workspace must stay Electron-only')
assert.match(inspectorSource, /restoredWorkspace\.tabs\.filter\(\(tab\) => tab\.kind !== 'browser'\)/u, 'Chrome must discard stale persisted webview tabs instead of reviving an unsupported workspace')
assert.match(inspectorSource, /if \(!isElectronRendererRuntime\(\) \|\| !projectPath\)[\s\S]{0,120}openBrowserPreviewExternal/u, 'resource links must open externally in Chrome instead of routing to an unavailable webview')
assert.doesNotMatch(browserAdapterSource, /Realtime voice currently requires the Zyra desktop window/u, 'the same-device browser must not retain dead realtime Voice stubs')
assert.match(browserAdapterSource, /const startRealtimeVoiceRemote = remoteAssistantMethod\('startRealtimeVoice'\)/u, 'browser realtime Voice start must use the typed Assistant bridge')
assert.match(browserAdapterSource, /await waitForVoiceStream\(\)/u, 'browser realtime Voice must wait for its owner event stream before signaling')
assert.match(browserAdapterSource, /consumeRealtimeVoiceEventStream/u, 'browser realtime Voice must receive its bounded event stream')
assert.match(browserHostSource, /microphone=\(self\)/u, 'the local browser host must permit only its own origin to request microphone access')
assert.match(browserHostSource, /camera=\(\)/u, 'enabling browser Voice must not broaden camera access')

console.log('Browser surface parity: ok')
