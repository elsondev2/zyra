import assert from 'node:assert/strict'
import { DESKTOP_WORKSPACE_COMMANDS, formatDesktopWorkspaceResult, parseDesktopWorkspaceCommand } from '../src/desktop-workspace-commands.mjs'
import { getSlashCommand } from '../src/slash-commands.mjs'
import { handleSlash } from '../src/slash-command-handlers.mjs'

for (const command of ['browser', 'details-ui', 'explore-files', 'resources', 'subagents-ui', 'diff-ui', 'terminal-ui']) {
  assert.equal(DESKTOP_WORKSPACE_COMMANDS.includes(command), true)
  assert.equal(getSlashCommand(command)?.name, command)
}
assert.equal(getSlashCommand('agents-ui')?.name, 'subagents-ui')
assert.deepEqual(parseDesktopWorkspaceCommand('browser', 'https://example.com --background'), {
  operation: 'open', workspace: 'browser', chat: null, url: 'https://example.com', background: true, focus: false, newWindow: false
})
assert.equal(parseDesktopWorkspaceCommand('explore-files', '"C:\\workspace\\My Project"').path, 'C:\\workspace\\My Project')
assert.deepEqual(parseDesktopWorkspaceCommand('details-ui', '--chat "Greeting Chat" --new-window'), {
  operation: 'open', workspace: 'details', chat: 'Greeting Chat', path: '', background: false, focus: false, newWindow: true
})
assert.deepEqual(parseDesktopWorkspaceCommand('browser', 'list'), { operation: 'list', workspace: 'browser', chat: null, focus: false })
assert.throws(() => parseDesktopWorkspaceCommand('resources', '--background'), /only with \/browser/)
assert.throws(() => parseDesktopWorkspaceCommand('browser', '--background --chat Other'), /current chat/)
assert.throws(() => parseDesktopWorkspaceCommand('browser', '--background --focus'), /cannot also request focus/)
assert.equal(formatDesktopWorkspaceResult({ operation: 'open', workspace: 'browser', background: true }, { chatTitle: 'Greeting Chat', label: 'Browser' }), 'Browser opened in the background for Greeting Chat.')
let opened = null
let message = ''
await handleSlash({ agentServer: { openDesktopWorkspace: async (input) => { opened = input; return { chatTitle: 'Greeting Chat', label: 'Resources' } } } }, { info: (value) => { message = value } }, '/resources')
assert.equal(opened.workspace, 'resources')
assert.equal(message, 'Opened Resources for Greeting Chat.')
console.log('Zyra Desktop workspace commands: ok')
