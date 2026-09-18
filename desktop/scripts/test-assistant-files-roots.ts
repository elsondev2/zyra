import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { AssistantChatScopeRoot } from '../src/shared/assistant/contracts'
import { assistantFilesRootContext, buildAssistantFilesRoots, defaultAssistantFilesRoot, findAssistantFilesRoot, restoreAssistantFilesRoot } from '../src/renderer/src/pages/assistant/assistant-files-roots'

const scoped: AssistantChatScopeRoot[] = [
    { id: 'home:one', kind: 'project-home', path: 'C:/Fixture/home', label: 'Project home', access: 'read-write' },
    { id: 'folder:one', kind: 'associated-folder', path: 'C:/Fixture/app-root', label: 'App root', access: 'read-only' },
    { id: 'folder:two', kind: 'associated-folder', path: 'C:/Fixture/second', label: 'second', access: 'read-write' }
]
const before = JSON.stringify(scoped)
for (const working of ['.', 'C:/Fixture/home', 'C:/Fixture/second']) {
    const roots = buildAssistantFilesRoots(working, scoped)
    assert.equal(defaultAssistantFilesRoot(roots, working), 'C:/Fixture/app-root', 'the first attached folder wins over home, compatibility CWD and a different working root')
    assert.equal(findAssistantFilesRoot(roots, 'c:\\fixture\\APP-ROOT\\')?.access, 'read-only', 'the selected root retains its read-only metadata')
}
assert.equal(defaultAssistantFilesRoot(buildAssistantFilesRoots('.', scoped.slice(0, 1)), '.'), 'C:/Fixture/home', 'folderless Projects fall back to their home')
assert.equal(defaultAssistantFilesRoot(buildAssistantFilesRoots('C:/Legacy', []), 'C:/Legacy'), 'C:/Legacy')
assert.equal(defaultAssistantFilesRoot([], null), null)
const roots = buildAssistantFilesRoots('C:/Fixture/home', scoped)
assert.equal(restoreAssistantFilesRoot(roots, 'C:/Fixture/home', { rootPath: 'C:/Fixture/second' }), 'C:/Fixture/second', 'valid saved views retain their selected root')
assert.equal(restoreAssistantFilesRoot(roots, 'C:/Fixture/home', { rootPath: 'C:/Removed' }), 'C:/Fixture/app-root', 'removed roots fall back to the first attachment')
assert.equal(restoreAssistantFilesRoot(roots, 'C:/Fixture/home', { currentFolderPath: 'C:/Fixture/second/src' }), 'C:/Fixture/second', 'explicit folder navigation is preserved')
const explicit = buildAssistantFilesRoots('C:/External/selected', scoped)
assert.equal(restoreAssistantFilesRoot(explicit, 'C:/External/selected', { currentFolderPath: 'C:/External/selected' }), 'C:/External/selected', 'shell folder opens still use their explicit destination')
assert.equal(restoreAssistantFilesRoot(roots, null, { currentFolderPath: 'C:/Fixture/second-other' }), 'C:/Fixture/app-root', 'folder containment respects path boundaries')
assert.equal(buildAssistantFilesRoots('c:\\fixture\\APP-ROOT\\', scoped).length, 3, 'path aliases cannot add a read-write compatibility duplicate')
const posix: AssistantChatScopeRoot[] = [{ ...scoped[1], path: '/Work/A' }, { ...scoped[2], path: '/work/a' }]
assert.equal(buildAssistantFilesRoots(null, posix).length, 2, 'POSIX path case remains distinct')
assert.notEqual(assistantFilesRootContext(scoped, '.'), assistantFilesRootContext([{ ...scoped[0], id: 'home:two', path: 'C:/Fixture/other-home' }, ...scoped.slice(1)], '.'), 'Project changes reset the selection context even with shared attached folders')
assert.equal(JSON.stringify(scoped), before, 'view defaults cannot alter scope data or working-root policy')

const files = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantFilesWorkspace.tsx', import.meta.url), 'utf8')
const explorer = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantExplorerWorkspace.tsx', import.meta.url), 'utf8')
const sidebar = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/PreviewNavigationSidebar.tsx', import.meta.url), 'utf8')
assert.match(files, /restoreAssistantFilesRoot\(roots, projectPath, stateCapsule\)/, 'the real Files surface uses the shared selection policy')
assert.match(files, /workspaceHeaderActions=\{rootSelector\}/)
assert.doesNotMatch(files, /<header className="flex h-9/, 'the old separate selector strip is removed')
assert.match(explorer, /workspaceHeaderActions=\{workspaceHeaderActions\}/)
const folderHeader = sidebar.slice(sidebar.indexOf("variant === 'workspace' ?"), sidebar.indexOf('aria-label="Search workspace files"'))
assert.ok(folderHeader.indexOf('{workspaceHeaderActions}') > folderHeader.indexOf('{activeFolderPath}</p>'), 'the selector follows the folder identity on the right of the same header')
assert.match(files, /readOnly=\{activeRoot\?\.access === 'read-only'\}/)
console.log('Files roots: first attachment default, restoration/explicit opens, access metadata, scope changes, aliases and header placement: ok')
