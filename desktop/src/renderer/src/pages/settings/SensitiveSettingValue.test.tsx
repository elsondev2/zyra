import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { SensitiveSettingValue } from './SensitiveSettingValue'
import {
    maskSensitiveSettingValue,
    reduceSensitiveSettingValue,
    type SensitiveSettingValueState
} from './sensitive-setting-value'

const syntheticEmail = 'sample.user@example.test'
assert.equal(maskSensitiveSettingValue(syntheticEmail, 2), 'sa••••••••')
assert.equal(maskSensitiveSettingValue('abcd', 99), 'abc••••••••', 'the hidden form never exposes the complete value')
assert.equal(maskSensitiveSettingValue('x', 3), '••••••••')

let state: SensitiveSettingValueState = { value: syntheticEmail, revealed: false }
state = reduceSensitiveSettingValue(state, { type: 'toggle', value: syntheticEmail })
assert.equal(state.revealed, true, 'an explicit action reveals the value')
state = reduceSensitiveSettingValue(state, { type: 'reset', value: 'changed-id-for-test' })
assert.deepEqual(state, { value: 'changed-id-for-test', revealed: false }, 'a value change resets disclosure')
state = reduceSensitiveSettingValue(state, { type: 'toggle', value: 'changed-id-for-test' })
state = reduceSensitiveSettingValue(state, { type: 'toggle', value: 'changed-id-for-test' })
assert.equal(state.revealed, false, 'the same control hides a revealed value')

const hiddenMarkup = renderToStaticMarkup(<SensitiveSettingValue value={syntheticEmail} label="Test email" visiblePrefix={2} />)
assert.ok(hiddenMarkup.includes('sa••••••••'))
assert.ok(hiddenMarkup.includes('aria-label="Show Test email"'))
assert.ok(!hiddenMarkup.includes(syntheticEmail), 'hidden text and attributes omit the complete value')
assert.ok(!hiddenMarkup.includes('title='), 'the value is not copied into a title attribute')

assert.deepEqual(
    readFileSync(new URL('../../../../../resources/icons/32x32.png', import.meta.url)),
    readFileSync(new URL('../../assets/branding/zyra-icon.png', import.meta.url)),
    'the Settings Zyra mark is the approved app artwork'
)
const piLogo = readFileSync(new URL('../../assets/provider-logos/pi.svg', import.meta.url), 'utf8')
assert.match(piLogo, /#F09082[\s\S]*#4D9ABF[\s\S]*#F1BE58/, 'the bundled Pi mark matches the official three-color artwork')
const logoAttribution = readFileSync(new URL('../../assets/provider-logos/README.md', import.meta.url), 'utf8')
assert.match(logoAttribution, /pi\.dev\/logo-auto\.svg[\s\S]*LICENSE\.pi\.txt/)

const source = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8')
const account = source('./AccountSettings.tsx')
assert.match(account, /<details[\s\S]*<summary[\s\S]*aria-expanded=/)
assert.match(account, /SensitiveSettingValue[\s\S]*label="Email"[\s\S]*SensitiveSettingValue[\s\S]*label="Account ID"/)
assert.doesNotMatch(account, /Access expires|Connection source|tokenExpiresAt|overview\?\.source/)
assert.match(account, /accountDetailsOpen \? overview\?\.account\?\.email \|\| '' : ''/, 'collapse removes the email from the sensitive child value')
assert.match(account, /accountDetailsOpen \? overview\.accountId : ''/, 'collapse removes the account ID from the sensitive child value')

const skills = source('./SkillsSettings.tsx')
assert.doesNotMatch(skills, /title="When changes apply"/)
assert.match(skills, /Project skills still win over personal skills[\s\S]*\/reload/)
assert.match(skills, /source\.priority \+ 1/)

const providerIcon = source('./SettingsProviderIcon.tsx')
assert.match(providerIcon, /provider-logos\/pi\.svg/)
assert.doesNotMatch(providerIcon, /\bPi\b.*from 'lucide-react'/)

const about = source('./AboutSettings.tsx')
for (const row of ['┏━━━┳┓ ┏┳━┳━━┓', '    ┗━━┛']) assert.ok(about.includes(row), 'About uses the TUI brand source')
assert.ok(about.indexOf('ZYRA_ASCII_LOGO') < about.indexOf('title="Updates"'))

console.log('Settings identity, skill-source and About refinements: masked DOM, reset state, authentic marks and bounded detail: ok')
