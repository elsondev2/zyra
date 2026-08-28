import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { isBrowserAssistantBridgeMethod } from '../src/shared/browser-assistant-bridge'
import { AssistantComposerCommandMenu } from '../src/renderer/src/pages/assistant/AssistantComposerCommandMenu'
import {
    applyAssistantComposerCommandItem,
    buildAssistantComposerCommandItems,
    findAssistantComposerSlashToken,
    getAssistantComposerCommandOptionId
} from '../src/renderer/src/pages/assistant/assistant-composer-command-menu'
import {
    listAssistantDesktopSlashCommandResources,
    parseAssistantDesktopSlashCommand,
    resolveAssistantDesktopSlashCommandAction
} from '../src/renderer/src/pages/assistant/assistant-composer-utils'

const resources = {
    commands: [
        { name: 'review', description: 'Review a change', scope: 'project' as const },
        { name: 'yolo', description: 'Attempted custom override', scope: 'project' as const }
    ],
    skills: [{
        name: 'release-check',
        description: 'Verify a release',
        scope: 'personal' as const,
        disableModelInvocation: false
    }],
    diagnostics: []
}

assert.deepEqual(
    listAssistantDesktopSlashCommandResources().map((command) => command.name),
    ['yolo', 'safe', 'include'],
    'the Desktop command manifest retains every intentionally supported local command'
)

const token = findAssistantComposerSlashToken('/rev', 4)
assert.deepEqual(token, { start: 0, end: 4, query: 'rev' })
assert.equal(findAssistantComposerSlashToken('Please /rev', 11), null)

const allItems = buildAssistantComposerCommandItems(resources, '')
for (const commandName of ['/yolo', '/safe', '/include', '/review']) {
    assert.equal(allItems.some((item) => item.label === commandName), true, `${commandName} remains available in the Desktop picker`)
}
assert.equal(
    allItems.find((item) => item.label === '/yolo')?.description,
    'Switch this thread to full access locally.',
    'custom resources cannot replace a trusted local Desktop command'
)
assert.deepEqual(
    buildAssistantComposerCommandItems(null, '').map((item) => item.label),
    ['/include', '/safe', '/yolo'],
    'built-in commands remain available while resource discovery is loading or unavailable'
)

const command = buildAssistantComposerCommandItems(resources, 'rev')[0]
assert.equal(command.value, '/review')
assert.deepEqual(
    applyAssistantComposerCommandItem('/rev', token!, command),
    { text: '/review ', cursor: 8 }
)

const skill = buildAssistantComposerCommandItems(resources, 'skill:release')[0]
assert.equal(skill.value, '/skill:release-check')

assert.deepEqual(
    resolveAssistantDesktopSlashCommandAction(parseAssistantDesktopSlashCommand('/yolo')!),
    { type: 'runtime-mode', mode: 'full-access' }
)
assert.deepEqual(
    resolveAssistantDesktopSlashCommandAction(parseAssistantDesktopSlashCommand('/safe')!),
    { type: 'runtime-mode', mode: 'approval-required' }
)
assert.deepEqual(
    resolveAssistantDesktopSlashCommandAction(parseAssistantDesktopSlashCommand('/include src/main.ts')!),
    { type: 'include', path: 'src/main.ts', name: 'main.ts', kind: 'code' }
)
assert.deepEqual(
    resolveAssistantDesktopSlashCommandAction(parseAssistantDesktopSlashCommand('/include')!),
    { type: 'error', message: 'Type a file path after /include.' }
)
assert.equal(parseAssistantDesktopSlashCommand('/review this'), null, 'custom commands continue through the model-backed prompt route')

const menuId = 'assistant-command-menu-test'
const markup = renderToStaticMarkup(createElement(AssistantComposerCommandMenu, {
    menuId,
    items: allItems,
    activeIndex: 0,
    loading: false,
    error: null,
    onActiveIndexChange: () => undefined,
    onSelect: () => undefined
}))
assert.match(markup, /\/review/)
assert.match(markup, /\/skill:release-check/)
assert.match(markup, /Commands and skills/)
assert.match(markup, new RegExp(`id="${getAssistantComposerCommandOptionId(menuId, allItems[0]!.id)}"`))
assert.match(markup, /role="listbox"/)
assert.match(markup, /role="option"/)

const composerSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantComposerView.tsx', import.meta.url), 'utf8')
const handlersSource = readFileSync(new URL('../src/renderer/src/pages/assistant/assistant-composer-handlers.ts', import.meta.url), 'utf8')
const browserAdapterSource = readFileSync(new URL('../src/renderer/src/lib/browser-assistant-bridge-adapter.ts', import.meta.url), 'utf8')
const mainPromptResourcesSource = readFileSync(new URL('../src/main/assistant/prompt-resources.ts', import.meta.url), 'utf8')
assert.match(composerSource, /aria-expanded=\{showSlashMenu\}/, 'the textarea exposes combobox expansion state')
assert.match(composerSource, /aria-activedescendant=/, 'keyboard selection exposes the active option to assistive technology')
assert.match(handlersSource, /resolveAssistantDesktopSlashCommandAction\(desktopCommand\)/, 'typed built-ins execute before model dispatch')
assert.equal(isBrowserAssistantBridgeMethod('listPromptResources'), false, 'remote Browser clients cannot enumerate private prompt resources')
assert.equal(isBrowserAssistantBridgeMethod('getSkillSourceOverview'), false, 'remote Browser clients cannot inspect private skill folders')
assert.equal(isBrowserAssistantBridgeMethod('updateSkillSourceSettings'), false, 'remote Browser clients cannot change local skill sources')
assert.match(browserAdapterSource, /Commands and skills are available only in trusted Zyra Desktop windows\./)
assert.match(browserAdapterSource, /Skill sources can be managed only in Zyra Desktop\./)
assert.match(mainPromptResourcesSource, /PROMPT_RESOURCE_CACHE_MAX_PROJECTS = 24/, 'main discovery cache has a fixed project bound')
assert.match(mainPromptResourcesSource, /if \(forceRefresh\) promptResourceCache\.delete\(key\)/, 'trusted callers can force a resource refresh')
assert.match(composerSource, /PROMPT_RESOURCE_CACHE_MAX_PROJECTS = 24/, 'renderer discovery cache cannot grow across unbounded project keys')

console.log('Assistant composer command menu: ok')
