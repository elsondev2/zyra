import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { OnboardingSnapshot } from '../src/shared/onboarding/contracts'
import { resolveOnboardingGateMode } from '../src/renderer/src/onboarding/onboarding-gate-policy'

const requiredSnapshot: OnboardingSnapshot = {
    hydrated: true,
    accessAllowed: false,
    showOnboarding: true,
    blockedReason: null,
    detectedSchemaVersion: null,
    recovery: null,
    record: null
}
const completedSnapshot: OnboardingSnapshot = {
    ...requiredSnapshot,
    accessAllowed: true,
    showOnboarding: false
}
const reviewSnapshot: OnboardingSnapshot = {
    ...completedSnapshot,
    showOnboarding: true
}

assert.equal(resolveOnboardingGateMode({ desktop: true, preferencesHydrated: false, preferencesError: null, onboardingLoading: false, onboardingError: null, snapshot: completedSnapshot }), 'desktop-loading')
assert.equal(resolveOnboardingGateMode({ desktop: true, preferencesHydrated: true, preferencesError: null, onboardingLoading: false, onboardingError: null, snapshot: requiredSnapshot }), 'desktop-onboarding')
assert.equal(resolveOnboardingGateMode({ desktop: false, preferencesHydrated: true, preferencesError: null, onboardingLoading: false, onboardingError: null, snapshot: requiredSnapshot }), 'browser-required')
assert.equal(resolveOnboardingGateMode({ desktop: false, preferencesHydrated: true, preferencesError: null, onboardingLoading: false, onboardingError: null, snapshot: reviewSnapshot }), 'normal', 'review mode preserves completed browser access')
assert.equal(resolveOnboardingGateMode({ desktop: true, preferencesHydrated: true, preferencesError: null, onboardingLoading: false, onboardingError: null, snapshot: completedSnapshot }), 'normal')
assert.equal(resolveOnboardingGateMode({ desktop: false, preferencesHydrated: true, preferencesError: null, onboardingLoading: false, onboardingError: null, snapshot: completedSnapshot }), 'normal')
assert.equal(resolveOnboardingGateMode({ desktop: true, preferencesHydrated: true, preferencesError: 'newer schema', onboardingLoading: false, onboardingError: null, snapshot: completedSnapshot }), 'desktop-error')
assert.equal(resolveOnboardingGateMode({ desktop: true, preferencesHydrated: true, preferencesError: null, onboardingLoading: false, onboardingError: null, snapshot: { ...requiredSnapshot, blockedReason: 'future-schema', detectedSchemaVersion: 9 } }), 'desktop-future-schema')

const here = dirname(fileURLToPath(import.meta.url))
const appSource = readFileSync(resolve(here, '../src/renderer/src/App.tsx'), 'utf8')
const gateSource = readFileSync(resolve(here, '../src/renderer/src/onboarding/OnboardingGate.tsx'), 'utf8')
const flowSource = readFileSync(resolve(here, '../src/renderer/src/onboarding/OnboardingFlow.tsx'), 'utf8')
const browserSource = readFileSync(resolve(here, '../src/renderer/src/onboarding/BrowserSetupRequired.tsx'), 'utf8')
const mainSource = readFileSync(resolve(here, '../src/main/index.ts'), 'utf8')

assert.match(appSource, /<SettingsProvider>[\s\S]*<OnboardingProvider>[\s\S]*<OnboardingGate>[\s\S]*<NormalDesktopApp/)
assert.doesNotMatch(appSource.split('function NormalDesktopApp')[1]?.split('function App')[0] || '', /OnboardingFlow/, 'normal routes must only mount behind the gate')
assert.match(gateSource, /resolveOnboardingGateMode/, 'gate rendering must use the main-owned completion policy')
assert.match(browserSource, /Finish setup in Zyra Desktop/)
assert.match(browserSource, /browser will unlock as soon as Desktop setup is complete/)
assert.doesNotMatch(flowSource, /Escape|onMouseDown|backdrop/, 'mandatory onboarding must not expose Escape or backdrop bypasses')
assert.match(flowSource, /Progress is saved after every Continue/)
assert.match(mainSource, /const launchHidden = setupComplete && initialShellLaunchTarget\?\.kind === 'file'/, 'shell file launches must not hide mandatory setup')
assert.match(mainSource, /pendingShellLaunchTargets\.push\(initialShellLaunchTarget\)/, 'pending launch intent must be retained')
assert.match(mainSource, /app\.on\('open-file'/, 'macOS Finder launches must enter the onboarding-aware shell target queue')
assert.match(mainSource, /getAssistantService: \(\) => setupServices\.onboarding\.isAccessAllowed\(\) \? getAssistantService\(\) : null/, 'browser runtime must defer Assistant construction until setup completes')
assert.match(mainSource, /configureApplicationMenu\(setupServices\.onboarding\.isAccessAllowed\(\)\)/, 'native menus must use setup-aware platform policy')
assert.match(mainSource, /if \(!setupComplete\)[\s\S]*\{ role: 'editMenu' \}[\s\S]*\{ role: 'windowMenu' \}/, 'macOS setup keeps only safe native editing/window affordances')
assert.match(mainSource, /setupServices\.onboarding\.subscribe\([\s\S]*configureApplicationMenu\(snapshot\.accessAllowed\)/, 'completing setup must restore the normal platform menu')

console.log('onboarding renderer gate: ok')
