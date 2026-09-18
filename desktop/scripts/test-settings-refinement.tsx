import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { SettingsPageContainer } from '../src/renderer/src/pages/settings/settings-layout'
import { SETTINGS_NAVIGATION_ITEMS, getSettingsCategoryDestinations } from '../src/renderer/src/pages/settings/settings-navigation'
import { getControllingSettingsTarget } from '../src/renderer/src/pages/settings/settings-dependencies'
import { getSettingsLocationTrail, readSettingsReturnLocation, settingsDetailNavigationState } from '../src/renderer/src/pages/settings/settings-navigation-context'
import { resolveSettingsSearchLocation } from '../src/renderer/src/pages/settings/settings-search'
const src = (path: string) => readFileSync(new URL(`../src/renderer/src/${path}`, import.meta.url), 'utf8')
assert.match(src('pages/Settings.tsx'), /settings\.startWithWindows \? \(/, 'hidden startup controls follow their parent feature')
assert.match(src('pages/settings/ProviderModelSettings.tsx'), /settings\.assistantTitleAutoRegenerate \? \(/)
assert.match(src('pages/settings/VoiceTranscriptionSettings.tsx'), /settings\.assistantTranscriptionEnabled \? \(/)
assert.match(src('pages/settings/GitTextGenerationSettings.tsx'), /chatGptSelected \? \(/)
assert.equal(SETTINGS_NAVIGATION_ITEMS.find(group => group.id === 'app')?.label, 'General')
assert.ok(!getSettingsCategoryDestinations('assistant').some(page => page.id === 'permissions'))
assert.match(src('pages/settings/AssistantSettings.tsx'), /<ChatAccessSettings \/>/)
const html = renderToStaticMarkup(<MemoryRouter><SettingsPageContainer title="Appearance" description="This subtitle must be gone"><span>Controls</span></SettingsPageContainer></MemoryRouter>)
assert.match(html, /Appearance/); assert.doesNotMatch(html, /This subtitle must be gone/)
assert.doesNotMatch(src('pages/settings/appearance/AppearanceThemePage.tsx'), /AppearanceWorkspacePreview|Live preview/)
assert.match(src('pages/settings/appearance/AppearanceThemePage.tsx'), /icon: <Moon/)
const css = src('index.css')
assert.match(css, /\.compact-mode \.zyra-settings-row\s*\{\s*padding-top: 8px;\s*padding-bottom: 8px;/)
assert.match(src('lib/settings.tsx'), /settings\.compactMode[\s\S]{0,100}classList\.add\('compact-mode'\)/)
assert.equal(getControllingSettingsTarget('settings-row-desktop-host-start-hidden', { startWithWindows: false }), 'settings-row-desktop-host-open-at-login')
assert.equal(getControllingSettingsTarget('settings-row-desktop-host-start-hidden', { startWithWindows: true }), null)
assert.equal(resolveSettingsSearchLocation('provider-models', 'settings-row-assistant-defaults-title-refresh-interval', { assistantTitleAutoRegenerate: false })?.targetId, 'settings-row-assistant-defaults-refresh-chat-titles')
assert.equal(getControllingSettingsTarget('settings-row-voice-transcription-chatgpt-transcription', { assistantTranscriptionEnabled: false }), 'settings-row-voice-transcription-voice-input')
assert.equal(getControllingSettingsTarget('settings-row-zyra-chatgpt-commit-model', { commitAIProvider: 'groq' }), 'settings-row-providers-default-git-ai-provider')
assert.deepEqual(getSettingsLocationTrail('/settings/app/appearance/colors'), ['Settings', 'Appearance', 'Customize colors'])
const state = settingsDetailNavigationState({ pathname: '/settings/workspace/source-control/writing', search: '?setting=test', hash: '#section', state: null })
assert.equal(readSettingsReturnLocation(state)?.pathname, '/settings/workspace/source-control/writing')
assert.equal(readSettingsReturnLocation(state)?.search, '?setting=test')
assert.equal(readSettingsReturnLocation({ settingsReturnTo: { pathname: 'https://example.com', search: '', hash: '', label: 'External' } }), null)
assert.match(src('pages/settings/SettingsPageTabs.tsx'), /state=\{settingsDetailNavigationState\(location\)\}/)
assert.match(src('pages/settings/SettingsBackLink.tsx'), /origin\.pathname/)
assert.match(src('pages/settings/GitTextGenerationSettings.tsx'), /to="\/settings\/workspace\/source-control\/writing\/connections"/)
assert.match(src('pages/settings/GitSettings.tsx'), /SensitiveSettingValue value=\{savedGlobalAuthor\.email\}/)
assert.doesNotMatch(src('pages/settings/GitSettings.tsx'), /status=\{[^\n]+`\$\{savedGlobalAuthor\.name\}/)
assert.doesNotMatch(src('pages/settings/MobileConnectionSettings.tsx'), /aria-label=\{[^\n]*device\.name/)
assert.match(src('pages/settings/MobileDeviceAccessDialog.tsx'), /SensitiveSettingValue value=\{device\.name\}/)
const fontDialog = src('pages/settings/appearance/AppearanceFontManagerDialog.tsx')
const download = fontDialog.split('const downloadGoogle')[1].split('const scanInstalledFonts')[0]
const importFont = fontDialog.split('const importFont')[1].split('const removeFont')[0]
assert.doesNotMatch(download + importFont, /await selectManagedFont/, 'downloading/importing leaves the picker open for preview before Use')
const preview = src('pages/settings/appearance/ManagedFontPreview.tsx')
assert.match(preview, /ownerDocument\.fonts\.add\(previewFace\)/, 'preview fonts load in the real native-popup document')
assert.match(preview, /ownerDocument\.defaultView\?\.IntersectionObserver/, 'visibility is measured in the popup viewport')
console.log('Settings refinement: clear headings, real compact spacing, icons, dependency-aware visibility/search and contextual navigation: ok')
