import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getZyraPlatformLabel, resolveZyraWindowChromePolicy } from '../src/shared/platform-window-chrome'

const windows = resolveZyraWindowChromePolicy('win32')
assert.equal(windows.nativeFrame, false)
assert.equal(windows.customWindowControls, true)
assert.equal(windows.titleBarStyle, 'default')

const mac = resolveZyraWindowChromePolicy('darwin')
assert.equal(mac.nativeFrame, true)
assert.equal(mac.customWindowControls, false)
assert.equal(mac.titleBarStyle, 'hiddenInset')
assert.equal(mac.reserveMacTrafficLights, true)

const linux = resolveZyraWindowChromePolicy('linux')
assert.equal(linux.nativeFrame, true)
assert.equal(linux.customWindowControls, false)
assert.equal(linux.titleBarStyle, 'default')

const browser = resolveZyraWindowChromePolicy('browser')
assert.equal(browser.customWindowControls, false)
assert.equal(getZyraPlatformLabel('win32'), 'Windows')
assert.equal(getZyraPlatformLabel('darwin'), 'macOS')
assert.equal(getZyraPlatformLabel('linux'), 'Linux')
assert.equal(getZyraPlatformLabel('browser'), 'Browser')

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(scriptDirectory, '..')
const mainSource = readFileSync(path.join(desktopRoot, 'src/main/index.ts'), 'utf8')
const titleBarSource = readFileSync(path.join(desktopRoot, 'src/renderer/src/components/layout/TitleBar.tsx'), 'utf8')
const quickPreviewSource = readFileSync(path.join(desktopRoot, 'src/renderer/src/pages/QuickPreviewTitleBar.tsx'), 'utf8')

assert.match(mainSource, /titleBarStyle: 'hiddenInset'/)
assert.match(mainSource, /Menu\.setApplicationMenu\(Menu\.buildFromTemplate/)
assert.match(mainSource, /attachWindowStateEvents\(window\)/)
assert.doesNotMatch(mainSource, /minHeight: 600,[\s\S]{0,100}frame: false/)
assert.match(titleBarSource, /windowChromePolicy\.customWindowControls/)
assert.match(titleBarSource, /runtime\.platform === 'darwin'/)
assert.match(quickPreviewSource, /windowChromePolicy\.customWindowControls/)

console.log('Platform window chrome contract: ok')
