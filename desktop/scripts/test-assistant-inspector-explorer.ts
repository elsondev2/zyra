import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DevScopeFileTreeNode } from '../src/shared/contracts/devscope-project-contracts'
import { collectWorkspaceTreeStats, filterWorkspaceTree } from '../src/renderer/src/components/ui/file-preview/PreviewNavigationSidebar'
import { previewDirectoryCanExpand } from '../src/renderer/src/components/ui/file-preview/previewVirtualTreeModel'
import { FileSystemEntryIcon } from '../src/renderer/src/components/ui/file-preview/FileSystemEntryIcon'
import { resolveMaterialFileIconAsset } from '../src/renderer/src/components/ui/file-preview/materialFileIconTheme'
import { readInspectorExplorerPreferences, writeInspectorExplorerPreferences } from '../src/renderer/src/components/ui/file-preview/inspectorExplorerPreferences'
import { applyIconGridSelection, mergeIconGridMarqueeSelection, rectanglesIntersect } from '../src/renderer/src/components/ui/file-preview/previewIconGridSelection'
import { preserveLoadedDirectoryChildren } from '../src/renderer/src/lib/filesystem/fileTreeMutations'
import { searchLoadedPreviewTree } from '../src/renderer/src/components/ui/file-preview/usePreviewFileSearch'

const preferenceValues = new Map<string, string>()
const preferenceStorage = {
    getItem: (key: string) => preferenceValues.get(key) || null,
    setItem: (key: string, value: string) => { preferenceValues.set(key, value) }
}
writeInspectorExplorerPreferences('C:/project', {
    view: 'icons',
    showHiddenFiles: true,
    navigationPaneWidth: 318,
    currentFolderPath: 'C:/project/src',
    expandedPathKeys: ['C:/project/src', 'C:/project/docs', 'C:/outside']
}, preferenceStorage)
assert.deepEqual(readInspectorExplorerPreferences('C:/project', preferenceStorage), {
    view: 'icons',
    showHiddenFiles: true,
    navigationPaneWidth: 318,
    currentFolderPath: 'C:/project/src',
    expandedPathKeys: ['C:/project/src', 'C:/project/docs']
})
assert.deepEqual(readInspectorExplorerPreferences('C:/another-project', preferenceStorage), {
    view: 'icons',
    showHiddenFiles: true,
    navigationPaneWidth: 318,
    currentFolderPath: null,
    expandedPathKeys: []
}, 'view and navigation width persist globally while folder state remains project-scoped')

const selectionPaths = ['a', 'b', 'c', 'd']
const toggledSelection = applyIconGridSelection(selectionPaths, new Set(['a']), 2, 0, 'toggle')
assert.deepEqual([...toggledSelection.selected], ['a', 'c'])
const rangedSelection = applyIconGridSelection(selectionPaths, toggledSelection.selected, 3, toggledSelection.anchorIndex, 'range')
assert.deepEqual([...rangedSelection.selected], ['c', 'd'])
assert.deepEqual([...mergeIconGridMarqueeSelection(new Set(['a']), ['c', 'd'])], ['a', 'c', 'd'])
assert.equal(rectanglesIntersect({ left: 0, top: 0, right: 20, bottom: 20 }, { left: 15, top: 15, right: 30, bottom: 30 }), true)
assert.equal(rectanglesIntersect({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 11, top: 11, right: 20, bottom: 20 }), false)

const tree: DevScopeFileTreeNode[] = [
    {
        name: 'src', path: 'C:/project/src', type: 'directory', isHidden: false, childrenLoaded: true,
        children: [
            { name: 'App.tsx', path: 'C:/project/src/App.tsx', type: 'file', isHidden: false },
            { name: 'styles.css', path: 'C:/project/src/styles.css', type: 'file', isHidden: false }
        ]
    },
    { name: 'README.md', path: 'C:/project/README.md', type: 'file', isHidden: false }
]
const filtered = filterWorkspaceTree(tree, 'app')
assert.equal(filtered.length, 1)
assert.equal(filtered[0]?.name, 'src', 'filtering preserves the parent folder needed to locate a matching file')
assert.deepEqual(filtered[0]?.children?.map((node) => node.name), ['App.tsx'])
const stats = collectWorkspaceTreeStats(tree)
assert.equal(stats.count, 4)
assert.equal(stats.directoryKeys.has('c:/project/src'), true)
const fileOnlyFolder = {
    name: 'exports',
    path: 'C:/project/exports',
    type: 'directory',
    isHidden: false,
    childrenLoaded: false,
    hasDirectoryChildren: false
} as DevScopeFileTreeNode
assert.equal(
    (previewDirectoryCanExpand as (node: DevScopeFileTreeNode, directoryOnly?: boolean) => boolean)(fileOnlyFolder, true),
    false,
    'folder-only navigation suppresses disclosure before clicking a directory known to have no subfolders'
)
assert.equal(previewDirectoryCanExpand(fileOnlyFolder), true, 'the full preview tree can still expand the same folder to show files')
const previouslyLoadedTree: DevScopeFileTreeNode[] = [{
    name: 'src', path: 'C:/project/src', type: 'directory', isHidden: false, childrenLoaded: true,
    children: [{ name: 'components', path: 'C:/project/src/components', type: 'directory', isHidden: false, childrenLoaded: true, children: [] }]
}]
const refreshedShallowRoot: DevScopeFileTreeNode[] = [{
    name: 'src', path: 'C:/project/src', type: 'directory', isHidden: false, childrenLoaded: false, hasDirectoryChildren: true
}]
const reconciledTree = preserveLoadedDirectoryChildren(refreshedShallowRoot, previouslyLoadedTree)
assert.equal(reconciledTree[0]?.childrenLoaded, true, 'a shallow root refresh preserves already-loaded branch state')
assert.equal(reconciledTree[0]?.children, previouslyLoadedTree[0]?.children, 'preserved branches retain stable child identity instead of expanding afresh')
const refreshedLoadedBranch: DevScopeFileTreeNode[] = [{
    name: 'src', path: 'C:/project/src', type: 'directory', isHidden: false, childrenLoaded: true,
    children: [{ name: 'new-child', path: 'C:/project/src/new-child', type: 'directory', isHidden: false, childrenLoaded: false }]
}]
const reconciledRefresh = preserveLoadedDirectoryChildren(refreshedLoadedBranch, previouslyLoadedTree)
assert.equal(reconciledRefresh[0]?.children?.[0]?.name, 'new-child', 'an explicitly refreshed branch overrides its preserved predecessor')
const immediateSearch = searchLoadedPreviewTree(tree, 'C:/project', 'C:/project', 'app', false, 20)
assert.deepEqual(immediateSearch.map((entry) => entry.relativePath), ['src/App.tsx'], 'loaded matches appear before the persistent index responds')
const folderSearch = searchLoadedPreviewTree(tree, 'C:/project', 'C:/project', 'src', false, 20)
assert.equal(folderSearch[0]?.type, 'directory', 'recursive search returns folders as well as files')
const markdownIcon = renderToStaticMarkup(createElement(FileSystemEntryIcon, { path: 'C:/project/README.md', kind: 'file', size: 44 }))
const textIcon = renderToStaticMarkup(createElement(FileSystemEntryIcon, { path: 'C:/project/notes.txt', kind: 'file', size: 44 }))
const logIcon = renderToStaticMarkup(createElement(FileSystemEntryIcon, { path: 'C:/project/debug.log', kind: 'file', size: 44 }))
assert.notEqual(markdownIcon, textIcon, 'Markdown and plain text render distinct SVG treatments')
assert.notEqual(markdownIcon, logIcon, 'Markdown and logs render distinct SVG treatments')
assert.notEqual(textIcon, logIcon, 'plain text and logs render distinct SVG treatments')
assert.equal(resolveMaterialFileIconAsset({ path: 'C:/project/README.md', kind: 'file' }).definition, 'readme')
assert.equal(resolveMaterialFileIconAsset({ path: 'C:/project/notes.txt', kind: 'file' }).definition, 'document')
assert.equal(resolveMaterialFileIconAsset({ path: 'C:/project/debug.log', kind: 'file' }).definition, 'log')
assert.equal(resolveMaterialFileIconAsset({ path: 'C:/project/vite.config.ts', kind: 'file' }).definition, 'vite')
assert.equal(resolveMaterialFileIconAsset({ path: 'C:/project/types.d.ts', kind: 'file' }).definition, 'typescript-def')
assert.equal(resolveMaterialFileIconAsset({ path: 'C:/project/src', kind: 'directory' }).definition, 'folder-src')
assert.equal(resolveMaterialFileIconAsset({ path: 'C:/project/src', kind: 'directory', expanded: true }).definition, 'folder-src-open')

const workspaceSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantExplorerWorkspace.tsx', import.meta.url), 'utf8')
const filesWorkspaceSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantFilesWorkspace.tsx', import.meta.url), 'utf8')
const assistantPageSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantPage.tsx', import.meta.url), 'utf8')
const inspectorSidebarSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantInspectorSidebar.tsx', import.meta.url), 'utf8')
const reviewIndexHookSource = readFileSync(new URL('../src/renderer/src/pages/assistant/useAssistantReviewIndex.ts', import.meta.url), 'utf8')
const fileActionsMenuSource = readFileSync(new URL('../src/renderer/src/components/ui/FileActionsMenu.tsx', import.meta.url), 'utf8')
const navigationSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/PreviewNavigationSidebar.tsx', import.meta.url), 'utf8')
const treeSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/PreviewVirtualFileTree.tsx', import.meta.url), 'utf8')
const iconSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/FileSystemEntryIcon.tsx', import.meta.url), 'utf8')
const sharedIconSource = readFileSync(new URL('../src/renderer/src/components/ui/FileEntryIcon.tsx', import.meta.url), 'utf8')
const iconGridSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/PreviewFileIconGrid.tsx', import.meta.url), 'utf8')
const detailsTableSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/PreviewFileDetailsTable.tsx', import.meta.url), 'utf8')
const iconThemeSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/materialFileIconTheme.ts', import.meta.url), 'utf8')
const viteConfigSource = readFileSync(new URL('../electron.vite.config.ts', import.meta.url), 'utf8')
const folderTreeHookSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/usePreviewFolderTree.ts', import.meta.url), 'utf8')
const fileSearchHookSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/usePreviewFileSearch.ts', import.meta.url), 'utf8')
const fileSearchResultsSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/PreviewFileSearchResults.tsx', import.meta.url), 'utf8')
const loadingSkeletonSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/PreviewLoadingSkeleton.tsx', import.meta.url), 'utf8')
const fileTreeHandlerSource = readFileSync(new URL('../src/main/ipc/handlers/file-tree-handlers.ts', import.meta.url), 'utf8')
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { dependencies?: Record<string, string> }
const materialManifest = JSON.parse(readFileSync(new URL('../node_modules/material-icon-theme/dist/material-icons.json', import.meta.url), 'utf8')) as {
    iconDefinitions: Record<string, { iconPath: string }>
    fileExtensions: Record<string, string>
    fileNames: Record<string, string>
    folderNames: Record<string, string>
}
assert.match(workspaceSource, /variant="workspace"/, 'chat Inspector Explorer selects the dedicated file-browser presentation')
assert.match(filesWorkspaceSource, /openPreviewRef\.current = preview\.openPreview/, 'preview state updates retain a stable bridge into the main Files explorer')
assert.match(filesWorkspaceSource, /handleOpenPreview = useCallback/, 'opening and loading a modal cannot invalidate the memoized Files tree')
assert.match(filesWorkspaceSource, /handleOpenPreviewInNewTab = useCallback/, 'preview-tab updates cannot redraw the main Files tree')
assert.match(assistantPageSource, /assistantDiffPanelModulePromise \|\|= createAssistantDiffPanelModule\(\)/, 'the large Inspector shell chunk has one reusable warmup request')
assert.doesNotMatch(assistantPageSource, /requestIdleCallback\(warm/, 'closed Inspector code cannot compete with Assistant startup work')
assert.doesNotMatch(assistantPageSource, /inspectorMounted/, 'closed persisted workspaces cannot mount behind the chat')
assert.match(assistantPageSource, /\{inspectorOpen \? \(\s*<Suspense/, 'Inspector work begins only when its surface is opened')
assert.match(assistantPageSource, /prefetch: false/, 'a closed Inspector cannot index an entire long chat in the background')
assert.match(assistantPageSource, /\(\) => inspectorOpen \? buildAssistantDiffTurns/, 'a closed Inspector skips full timeline-to-Review derivation')
assert.match(assistantPageSource, /refreshKey: diffSource\.activeTurnId \|\| 'idle'/, 'live activity events do not rerun the full Review index query throughout a turn')
assert.match(reviewIndexHookSource, /pendingReviewIndexRequests/, 'concurrent Review requests share one in-flight read')
assert.match(reviewIndexHookSource, /loadedRequestKeyRef\.current === requestKey/, 'reopening the same Review reuses its settled renderer index instead of repeating an IPC read')
assert.equal((inspectorSidebarSource.match(/duration-\[280ms\]/g) || []).length >= 3, true, 'body, title bar, and content use one synchronized Inspector entrance duration')
assert.equal((inspectorSidebarSource.match(/cubic-bezier\(0\.22,1,0\.36,1\)/g) || []).length >= 3, true, 'Inspector motion uses one consistent ease-out curve')
assert.doesNotMatch(inspectorSidebarSource, /duration-\[(?:320|360)ms\]/, 'the Inspector no longer mixes competing entrance timings')
assert.match(navigationSource, /Search workspace files/)
assert.match(navigationSource, /Search project files/)
assert.match(navigationSource, /<PreviewFileSearchResults/, 'both Files surfaces switch to the shared indexed result view while searching')
assert.match(navigationSource, /aria-label="New file"/, 'the shared folder pane exposes direct new-file control')
assert.match(navigationSource, /aria-label="New folder"/, 'the shared folder pane exposes direct new-folder control')
assert.match(navigationSource, /aria-label="Refresh folder tree"/, 'the shared folder pane exposes direct refresh control')
assert.match(navigationSource, /Collapse folder tree/)
assert.match(navigationSource, /Search this folder/)
assert.match(navigationSource, /title="Explorer options"/)
assert.match(navigationSource, /<FileActionsMenu/, 'Explorer dropdowns use the shared positioned menu surface')
assert.doesNotMatch(navigationSource, /<details/, 'native details popovers are not used for Explorer controls')
assert.match(navigationSource, /menuWidth=\{220\}/, 'options positioning uses its real width and cannot trim checked indicators')
assert.match(fileActionsMenuSource, /role=\{typeof item\.checked === 'boolean' \? 'menuitemcheckbox'/, 'option rows expose proper checked menu semantics')
assert.match(fileActionsMenuSource, /createPortal/, 'menus escape Inspector clipping and use viewport-aware placement')
assert.match(fileActionsMenuSource, /ArrowDown/, 'menus support keyboard navigation')
assert.match(navigationSource, /aria-label="Large icons"/)
assert.match(navigationSource, /aria-label="Details view"/)
assert.match(navigationSource, /Show hidden files/)
assert.match(navigationSource, /workspaceVisibleCount/)
assert.match(navigationSource, /readInspectorExplorerPreferences/)
assert.match(navigationSource, /writeInspectorExplorerPreferences/)
assert.match(navigationSource, /onExpandedPathKeysChange/)
assert.match(folderTreeHookSource, /initialFolderPath/, 'the last visited project folder restores before the first filesystem request')
assert.match(folderTreeHookSource, /includeDirectoryChildHint: directoryOnlyTree/, 'folder-only navigation requests reliable subfolder hints from the filesystem')
assert.equal((folderTreeHookSource.match(/preserveLoadedDirectoryChildren\(/g) || []).length >= 2, true, 'cached and fresh root snapshots preserve already-loaded branches')
assert.match(fileTreeHandlerSource, /hasDirectoryChildren/, 'shallow directory reads report whether a folder contains visible subfolders')
assert.match(folderTreeHookSource, /Promise\.all\(directoryPaths\.map/, 'deep restored folders load their directory snapshots concurrently')
assert.doesNotMatch(folderTreeHookSource, /for \(const ancestorPath of targetAncestorPaths\)[\s\S]*await loadTree/, 'deep restoration cannot regress to serialized IPC requests')
assert.match(fileSearchHookSource, /searchIndexedPaths/, 'recursive Files search uses the persistent main-process path index')
assert.match(fileSearchHookSource, /includeAncestors: false/, 'the flat result surface skips ancestor N+1 hydration')
assert.match(fileSearchResultsSource, /usePreviewVirtualWindow/, 'recursive search results remain virtualized')
assert.match(fileSearchResultsSource, /Shift|shiftKey/, 'search supports opening a result in a new preview tab')
assert.match(loadingSkeletonSource, /TREE_ROW_DEPTHS/, 'cold Files loading uses hierarchy-shaped skeleton rows')
assert.doesNotMatch(navigationSource, /No project files found/, 'the old framed empty-state copy is removed')
assert.match(treeSource, /presentation === 'workspace'/)
assert.match(navigationSource, /assistant-workspace-explorer-layout__tree/, 'full-screen Files keeps a dedicated folder tree beside the main view')
assert.match(navigationSource, /variant === 'navigation'/, 'the folder-only navigation presentation remains available to the main Files surface')
assert.match(navigationSource, /folderNavigationTreeSurface/, 'main Files renders its dedicated folder-tree surface')
assert.match(navigationSource, /aria-label="Resize folder navigation pane"/, 'the full-screen folder tree exposes a real resize separator')
assert.match(navigationSource, /navigationPaneWidth/, 'folder navigation width remains stable across navigation and workspace remounts')
assert.match(treeSource, /preserveViewportAnchor/, 'folder expansion and lazy loading retain the visible tree anchor')
assert.match(navigationSource, /<PreviewFileDetailsTable/, 'the former full-tree toggle now opens a proper details table')
assert.match(detailsTableSource, /Date modified/, 'details view exposes File Explorer metadata columns')
assert.match(detailsTableSource, /usePreviewVirtualWindow/, 'large details tables remain row-virtualized')
assert.match(detailsTableSource, /aria-sort/, 'details columns support accessible sorting')
assert.match(treeSource, /FileSystemEntryIcon/)
assert.match(treeSource, /usePreviewVirtualWindow/, 'Inspector Explorer retains fixed-row virtualization')
assert.equal(packageJson.dependencies?.['material-icon-theme'], '^5.37.0', 'Explorer uses the selected full Material Icon Theme')
assert.equal(packageJson.dependencies?.['react-file-icon'], undefined, 'the rejected icon library is fully removed')
assert.equal(Object.keys(materialManifest.iconDefinitions).length >= 1_200, true, 'the complete Material definition catalog is installed')
assert.equal(Object.keys(materialManifest.fileExtensions).length >= 1_300, true, 'the complete extension association catalog is installed')
assert.equal(Object.keys(materialManifest.fileNames).length >= 2_000, true, 'specific developer filenames retain dedicated icons')
assert.equal(Object.keys(materialManifest.folderNames).length >= 4_500, true, 'the full specialized folder catalog is available')
assert.equal(existsSync(new URL('../node_modules/material-icon-theme/icons/readme.svg', import.meta.url)), true)
assert.equal(existsSync(new URL('../node_modules/material-icon-theme/icons/log.svg', import.meta.url)), true)
assert.match(iconSource, /FileEntryIcon/, 'Inspector delegates to the app-wide file icon component')
assert.match(sharedIconSource, /resolveMaterialFileIconAsset/)
assert.match(iconThemeSource, /manifest\.fileNames\[name\]/, 'specific filenames win over generic extensions')
assert.match(iconThemeSource, /manifest\.fileExtensions\[candidate\]/, 'compound extensions resolve through the complete theme map')
assert.match(iconThemeSource, /manifest\.folderNamesExpanded/, 'open folders use the theme’s dedicated expanded variants')
assert.match(viteConfigSource, /material-icon-theme\/icons\/\*\.svg/, 'the complete local SVG theme is copied into renderer output')
assert.doesNotMatch(`${iconSource}\n${sharedIconSource}`, /https?:\/\//, 'Inspector file icons remain local and offline')
assert.match(iconGridSource, /grid-cols-\[repeat\(auto-fill,minmax\(92px,1fr\)\)\]/, 'large-icon view follows the requested Finder/File Explorer layout')
assert.match(iconGridSource, /usePreviewVirtualWindow/, 'large folders mount only the visible icon rows')
assert.match(iconGridSource, /overscanRows: 1/, 'icon virtualization keeps image decode overscan intentionally narrow')
assert.match(iconGridSource, /getFileThumbnailUrl/, 'grid images use bounded main-owned thumbnails instead of decoding originals')
assert.match(iconGridSource, /loading="lazy"/, 'image thumbnails decode only near the visible grid')
assert.match(iconGridSource, /object-cover opacity-30 blur-md/, 'thumbnail backdrops fill the tile without cropping the primary image')
assert.match(iconGridSource, /object-contain/, 'the primary thumbnail remains completely visible')
assert.match(iconGridSource, /onDoubleClick/, 'single click selects while double click opens an icon')
assert.match(iconGridSource, /color-mix\(in srgb, var\(--accent-primary\) 68%/, 'grid selection uses a clear accent border')
assert.doesNotMatch(iconGridSource, /selected \? <span[^\n]+<Check/, 'selected grid items do not add a check badge')
assert.match(iconGridSource, /aria-multiselectable="true"/, 'icon view exposes multi-selection semantics')
assert.match(iconGridSource, /setPointerCapture/, 'blank-space dragging captures a stable marquee gesture')
assert.match(iconGridSource, /applyIconGridSelection/, 'Ctrl\/Cmd and Shift selection share the tested selection model')
assert.match(iconGridSource, /mergeIconGridMarqueeSelection/, 'marquee selection can add to an existing multi-selection')
assert.match(iconGridSource, /getSelectionActions/, 'right-clicking a multi-selection requests a batch-specific action set')
assert.match(navigationSource, /label: `Copy \$\{nodes\.length\} paths`/, 'multi-selection exposes one copy-paths action')
assert.match(navigationSource, /label: `Delete \$\{nodes\.length\} items`/, 'multi-selection exposes one confirmed batch delete action')
assert.match(navigationSource, /previewableFiles\.length === nodes\.length/, 'open-in-tabs appears only when every selected item supports preview')

console.log('Assistant Inspector Explorer contract: ok')
