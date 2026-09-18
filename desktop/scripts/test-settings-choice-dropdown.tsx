import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { SettingsSegmented } from '../src/renderer/src/pages/settings/settings-layout'

const options = [{ value: 'queue', label: 'Queue next' }, { value: 'force', label: 'Interrupt' }] as const
const changes: string[] = []
const html = renderToStaticMarkup(<SettingsSegmented value="force" options={options} onChange={value => changes.push(value)} label="Busy send behavior" />)
assert.equal((html.match(/<button\b/g) || []).length, 1, 'one compact trigger replaces the row of segmented buttons')
assert.match(html, /aria-haspopup="menu"/)
assert.match(html, /aria-expanded="false"/)
assert.match(html, /aria-label="Busy send behavior"/)
assert.match(html, /Interrupt/)
assert.doesNotMatch(html, /Queue next/, 'other choices stay in the closed popup')
assert.deepEqual(changes, [], 'rendering or opening a choice must not persist a preference')
const disabled = renderToStaticMarkup(<SettingsSegmented value="queue" options={options} onChange={() => { throw Error('disabled callback') }} label="Busy send behavior" disabled />)
assert.match(disabled, /<button[^>]*disabled=""/)
const unknown = renderToStaticMarkup(<SettingsSegmented value="saved-unknown" options={options} onChange={() => {}} label="Choice" />)
assert.match(unknown, /saved-unknown/, 'an unrecognized saved value must not be presented as the first option')

const { buildSettingsChoiceItems } = await import('../src/renderer/src/pages/settings/settings-choice-options')
const items = buildSettingsChoiceItems('force', options, value => changes.push(value))
assert.deepEqual(items.map(item => [item.id, item.label, item.checked]), [['queue', 'Queue next', false], ['force', 'Interrupt', true]])
items[0].onSelect(); items[1].onSelect()
assert.deepEqual(changes, ['queue', 'force'], 'both changed and already-current choices keep the existing callback contract')
const locked = buildSettingsChoiceItems('queue', options, () => { throw Error('disabled selection') }, true)
assert.ok(locked.every(item => item.disabled)); locked[0].onSelect()
assert.deepEqual(buildSettingsChoiceItems('', [], () => {}), [])
const dropdown = readFileSync(new URL('../src/renderer/src/pages/settings/SettingsChoiceDropdown.tsx', import.meta.url), 'utf8')
const menu = readFileSync(new URL('../src/renderer/src/components/ui/FileActionsMenu.tsx', import.meta.url), 'utf8')
assert.match(dropdown, /selectionMode="radio"/)
assert.match(dropdown, /presentation="portal"/, 'choice menus escape settings-row containment and dialogs')
assert.match(menu, /radioSelection \? 'menuitemradio' : 'menuitemcheckbox'/)
assert.match(menu, /\[aria-checked="true"\]/, 'keyboard opening can focus the current choice')
assert.match(menu, /event\.preventDefault\(\)[\s\S]{0,90}event\.stopPropagation\(\)/)
assert.match(menu, /handleEscapeLocally = radioSelection \|\| containEscape/, 'radio choices retain local Escape handling; action menus opt in separately')
assert.match(menu, /containEscape = false/, 'other action menus keep their existing default behavior')
assert.match(menu, /addOverlayEventListener\('keydown', handleEscape, handleEscapeLocally\)/, 'choice Escape is handled before the enclosing dialog')
assert.match(menu, /radioSelection && event\.detail === 0/, 'Enter/Space opening moves focus into the choice menu')
console.log('Settings choice dropdown: compact trigger, exact values, current/disabled/unknown states, single-choice semantics and shared portal/keyboard wiring: ok')
