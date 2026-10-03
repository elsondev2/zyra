import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { PluginSkillIcon, shortSkillDescription, UseInChatIcon } from '../src/renderer/src/pages/plugins/plugin-presentation'
import { buildAssistantComposerCommandItems } from '../src/renderer/src/pages/assistant/assistant-composer-command-menu'

assert.equal(shortSkillDescription('Capture decisions in Notion; use when saving meeting notes.'), 'Capture decisions in Notion')
assert.ok(shortSkillDescription('Long useful description '.repeat(12)).length <= 110)
assert.equal(shortSkillDescription(''), '')
assert.ok(renderToStaticMarkup(<UseInChatIcon />).includes('lucide-message-circle-more'), 'all plugin chat actions share the conversation icon')
assert.ok(renderToStaticMarkup(<PluginSkillIcon pluginName="notion" />).includes('notion.png'))
assert.ok(!renderToStaticMarkup(<PluginSkillIcon pluginName="unknown-local-plugin" />).includes('<img'))
const items = buildAssistantComposerCommandItems({ commands: [], diagnostics: [], skills: [{ name: 'capture', description: 'Save decisions; use when taking notes.', scope: 'personal', disableModelInvocation: false, pluginId: 'real-plugin-id', sourceLabel: 'Notion' }] }, '')
assert.equal(items.find(item => item.kind === 'skill')?.pluginName, 'notion')
assert.equal(items.find(item => item.kind === 'skill')?.description, 'Save decisions; use when taking notes.', 'search retains the original full description')
console.log('Plugin skill identity, compact descriptions and composer provenance passed.')
