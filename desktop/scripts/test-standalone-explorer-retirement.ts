import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const read = (relativePath: string) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8')

const appSource = read('src/renderer/src/App.tsx')
const titleBarSource = read('src/renderer/src/components/layout/TitleBar.tsx')
const loadingRouteSource = read('src/renderer/src/components/ui/app-loading-route.ts')
const loadingSkeletonSource = read('src/renderer/src/components/ui/AppRouteSkeleton.tsx')
const projectSettingsSource = read('src/renderer/src/pages/settings/ProjectsSettings.tsx')
const explorerPreferencesSource = read('src/renderer/src/pages/settings/ExplorerSettings.tsx')
const settingsNavigationSource = read('src/renderer/src/pages/settings/settings-navigation.tsx')
const settingsSearchSource = read('src/renderer/src/pages/settings/settings-search.ts')
const legacyProjectsSource = read('src/renderer/src/pages/FolderBrowse.tsx')

assert.doesNotMatch(appSource, /import\('\.\/pages\/Explorer'\)/, 'the retired standalone Explorer cannot remain in the renderer bundle graph')
assert.doesNotMatch(appSource, /<Explorer\s*\/>/, 'no route can render the retired standalone Explorer')
assert.match(appSource, /path="\/explorer" element=\{<Navigate to="\/assistant" replace \/>\}/, 'old Explorer links retire into the Assistant workspace')
assert.match(appSource, /path="\/explorer\/\*" element=\{<Navigate to="\/assistant" replace \/>\}/, 'old deep Explorer links retire into the Assistant workspace')
assert.doesNotMatch(titleBarSource, /pathname\.startsWith\('\/explorer'\)/, 'the title bar has no standalone Explorer identity')
assert.doesNotMatch(loadingRouteSource, /'explorer'/, 'startup no longer treats Explorer as an active screen')
assert.doesNotMatch(loadingSkeletonSource, /ExplorerRouteSkeleton|Opening Explorer|route === 'explorer'/, 'the retired screen has no loading presentation')
assert.doesNotMatch(explorerPreferencesSource, /Enable Explorer|explorerTabEnabled/, 'settings cannot reactivate the retired screen')
assert.match(explorerPreferencesSource, /SettingsSection title="Project browser"/, 'shared legacy project presentation settings remain clearly named')
assert.doesNotMatch(settingsNavigationSource, /Projects & explorer|discovery, and Explorer/, 'settings navigation no longer advertises the retired screen')
assert.doesNotMatch(settingsSearchSource, /Enable Explorer|rows\('Explorer'/, 'settings search cannot resurrect retired Explorer controls')
assert.equal(existsSync(new URL('../src/renderer/src/pages/Explorer.tsx', import.meta.url)), false, 'the standalone Explorer wrapper is removed')

assert.match(legacyProjectsSource, /mode = 'projects'/, 'the legacy Projects page remains available for later retirement')
assert.match(appSource, /path="\/projects" element=\{<Navigate to="\/assistant" replace \/>\}/, 'this change does not alter the existing legacy Projects route policy')
assert.equal(existsSync(new URL('../src/renderer/src/pages/assistant/AssistantExplorerWorkspace.tsx', import.meta.url)), true, 'Assistant Files remains intact and out of scope')
assert.match(projectSettingsSource, /<ExplorerPreferencesSections \/>/, 'legacy project browser preferences remain available')

console.log('Standalone Explorer retirement: ok')
