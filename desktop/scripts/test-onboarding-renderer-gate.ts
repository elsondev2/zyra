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
const stepsSource = readFileSync(resolve(here, '../src/renderer/src/onboarding/OnboardingSteps.tsx'), 'utf8')
const backgroundSource = readFileSync(resolve(here, '../src/renderer/src/onboarding/OnboardingBackground.tsx'), 'utf8')
const motionSource = readFileSync(resolve(here, '../src/renderer/src/onboarding/OnboardingFlow.css'), 'utf8')
const openAiLogoSource = readFileSync(resolve(here, '../src/renderer/src/components/ui/OpenAiLogo.tsx'), 'utf8')
const themeSelectSource = readFileSync(resolve(here, '../src/renderer/src/pages/settings/appearance/AppearanceThemeSelect.tsx'), 'utf8')
const browserSource = readFileSync(resolve(here, '../src/renderer/src/onboarding/BrowserSetupRequired.tsx'), 'utf8')
const mainSource = readFileSync(resolve(here, '../src/main/index.ts'), 'utf8')

assert.match(appSource, /<SettingsProvider>[\s\S]*<OnboardingProvider>[\s\S]*<OnboardingGate>[\s\S]*<NormalDesktopApp/)
assert.doesNotMatch(appSource.split('function NormalDesktopApp')[1]?.split('function App')[0] || '', /OnboardingFlow/, 'normal routes must only mount behind the gate')
assert.match(gateSource, /resolveOnboardingGateMode/, 'gate rendering must use the main-owned completion policy')
assert.match(browserSource, /Finish setup in Zyra Desktop/)
assert.match(browserSource, /browser will unlock as soon as Desktop setup is complete/)
assert.doesNotMatch(flowSource, /Escape|onMouseDown|backdrop/, 'mandatory onboarding must not expose Escape or backdrop bypasses')
assert.doesNotMatch(flowSource, /<aside|Progress saves after each step/, 'centered onboarding must not restore the old sidebar or helper copy')
assert.match(flowSource, /Setup step \$\{currentIndex \+ 1\} of \$\{ONBOARDING_STEPS\.length\}/, 'compact progress must describe the current numbered step')
assert.match(flowSource, /onboarding-fixed-heading/, 'non-welcome step titles must use the stable upper viewport anchor')
assert.match(flowSource, /onboarding-action-dock/, 'Back and Continue must share a stable viewport dock')
assert.match(flowSource, /onboarding-dock-progress/, 'numbered progress must stay centered between the fixed actions')
assert.match(flowSource, /onboarding\.updateAppearance\(\{[\s\S]*selection: nextAppearance/, 'appearance choices must save immediately through the constrained setup API')
assert.doesNotMatch(flowSource, /previewAppearance|clearAppearancePreview/, 'saved setup themes must not fall back to a renderer-only preview')
assert.doesNotMatch(flowSource, /web-access|WebAccessStep/, 'web defaults must not add setup friction')
assert.match(flowSource, /stepScrollRef\.current\.scrollTop = 0/, 'each fixed-title step must open at the top of its own scroll region')
assert.match(motionSource, /\.onboarding-fixed-heading\s*\{[\s\S]*?position: fixed;/)
assert.match(motionSource, /\.onboarding-action-dock\s*\{[\s\S]*?position: fixed;/)
assert.match(motionSource, /\.onboarding-step-content\s*\{[\s\S]*?padding-top: 4px;/, 'hover motion needs headroom inside the clipped step scroller')
assert.doesNotMatch(flowSource, /document\.startViewTransition/, 'step animations must not snapshot the WebGL background or delay persistence')
assert.match(motionSource, /translate3d/, 'step changes must stay on lightweight compositor transforms')
assert.match(motionSource, /prefers-reduced-motion/)
assert.match(stepsSource, /Welcome to/)
assert.match(stepsSource, /Start setup/)
assert.match(stepsSource, /Continue with ChatGPT/)
assert.match(stepsSource, /<OpenAiLogo/, 'the primary ChatGPT action must use the theme-aware OpenAI mark')
assert.match(openAiLogoSource, /fill="currentColor"/, 'the OpenAI mark must follow the active Zyra theme')
assert.match(stepsSource, /role="separator" aria-label="Alternative OpenAI connection"[\s\S]*<span>or<\/span>/, 'ChatGPT and API-key flows need a visible or divider')
assert.match(stepsSource, /Use an API key instead/)
assert.match(stepsSource, /onboarding-review-ready[\s\S]*onboarding-review-grid/, 'the final review must provide an inviting, scannable setup summary')
assert.match(motionSource, /\.onboarding-review-grid\s*\{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/)
assert.match(stepsSource, /AppearanceThemeSelector[\s\S]*appearance=\{activeAppearance\}/, 'setup must show one catalog selector for the currently resolved appearance')
assert.match(stepsSource, /createAppearanceSelection[\s\S]{0,420}appearanceThemeMode: settings\.appearanceThemeMode/, 'the main-owned saved appearance must win when setup resumes')
assert.match(themeSelectSource, /LIGHT_THEMES[\s\S]*DARK_THEMES/, 'the shared selector must keep light and dark catalogs separate')
assert.match(themeSelectSource, /role="listbox"[\s\S]*role="option"/, 'theme dropdowns must expose accessible listbox semantics')
assert.match(themeSelectSource, /PALETTE_ROLES\.map/, 'every dropdown row must render the complete Zyra theme token palette')
assert.match(themeSelectSource, /createPortal\(popover, document\.body\)/, 'theme menus must escape clipped onboarding and Settings scroll regions')
assert.match(themeSelectSource, /option\.offsetTop/, 'opening a theme menu must center its active theme rather than start at the first row')
assert.match(themeSelectSource, /MAX_LIST_HEIGHT = 168/, 'theme menus must use the shortened frame')
assert.match(backgroundSource, /detail="low"/)
assert.match(backgroundSource, /maxFps=\{24\}/)
assert.match(mainSource, /const launchHidden = setupComplete && initialShellLaunchTarget\?\.kind === 'file'/, 'shell file launches must not hide mandatory setup')
assert.match(mainSource, /pendingShellLaunchTargets\.push\(initialShellLaunchTarget\)/, 'pending launch intent must be retained')
assert.match(mainSource, /getAssistantService: \(\) => setupServices\.onboarding\.isAccessAllowed\(\) \? getAssistantService\(\) : null/, 'browser runtime must defer Assistant construction until setup completes')
assert.match(mainSource, /configureApplicationMenu\(setupServices\.onboarding\.isAccessAllowed\(\)\)/, 'native menus must use setup-aware platform policy')
assert.match(mainSource, /if \(!setupComplete\)[\s\S]*\{ role: 'editMenu' \}[\s\S]*\{ role: 'windowMenu' \}/, 'macOS setup keeps only safe native editing/window affordances')
assert.match(mainSource, /setupServices\.onboarding\.subscribe\([\s\S]*configureApplicationMenu\(snapshot\.accessAllowed\)/, 'completing setup must restore the normal platform menu')

console.log('onboarding renderer gate: ok')
