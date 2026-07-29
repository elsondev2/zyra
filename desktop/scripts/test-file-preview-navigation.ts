import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getPreviewNavigatorFolderPath } from '../src/renderer/src/components/ui/file-preview/usePreviewFolderTree'
import {
    createPreviewNavigationState,
    getPreviewNavigationTarget,
    movePreviewNavigationToIndex,
    recordPreviewNavigationEntry,
    type PreviewNavigationEntry
} from '../src/renderer/src/components/ui/file-preview/preview-navigation-history'

function entry(name: string): PreviewNavigationEntry {
    return {
        file: { name, path: `C:/project/${name}`, type: 'md' },
        extension: 'md',
        mediaItems: []
    }
}

assert.equal(
    getPreviewNavigatorFolderPath('C:\\project\\src\\components\\Panel.tsx'),
    'C:/project/src/components',
    'file targets open the navigator at their containing folder'
)
assert.equal(
    getPreviewNavigatorFolderPath('C:\\project\\src\\components\\', true),
    'C:\\project\\src\\components',
    'directory targets open that directory itself'
)

const first = entry('first.md')
const second = entry('second.md')
const third = entry('third.md')
let state = createPreviewNavigationState(first)
state = recordPreviewNavigationEntry(state, second)
assert.equal(state.index, 1)
assert.equal(getPreviewNavigationTarget(state, -1)?.entry.file.name, 'first.md')
assert.equal(getPreviewNavigationTarget(state, 1), null)

state = movePreviewNavigationToIndex(state, 0)
assert.equal(getPreviewNavigationTarget(state, 1)?.entry.file.name, 'second.md')
state = recordPreviewNavigationEntry(state, third)
assert.deepEqual(state.entries.map((item) => item.file.name), ['first.md', 'third.md'], 'opening a file after Back clears the abandoned forward branch')
assert.equal(state.index, 1)

state = recordPreviewNavigationEntry(state, { ...third, file: { ...third.file, focusLine: 42 } })
assert.equal(state.entries.length, 2, 'revisiting the current file updates its location without adding duplicate history')
assert.equal(state.entries[1]?.file.focusLine, 42)

const modalSource = readFileSync(new URL('../src/renderer/src/components/ui/FilePreviewModal.tsx', import.meta.url), 'utf8')
const windowedHeaderSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/PreviewModalHeader.tsx', import.meta.url), 'utf8')
const expandedHeaderSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/PreviewExpandedHeaderBar.tsx', import.meta.url), 'utf8')
const historyNavigationSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/PreviewHistoryNavigation.tsx', import.meta.url), 'utf8')
const historyHookSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/useFilePreviewNavigationHistory.ts', import.meta.url), 'utf8')
const layoutSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/PreviewModalLayout.tsx', import.meta.url), 'utf8')
const previewHookSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/useFilePreview.ts', import.meta.url), 'utf8')
const assistantNavigationSource = readFileSync(new URL('../src/renderer/src/pages/assistant/assistant-file-navigation.ts', import.meta.url), 'utf8')
const markdownNavigationSource = readFileSync(new URL('../src/renderer/src/components/ui/markdown/linkNavigation.ts', import.meta.url), 'utf8')
const sidebarSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/PreviewNavigationSidebar.tsx', import.meta.url), 'utf8')
const virtualTreeSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/PreviewVirtualFileTree.tsx', import.meta.url), 'utf8')
const virtualWindowSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/usePreviewVirtualWindow.ts', import.meta.url), 'utf8')
const treeMenuSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/PreviewTreeContextMenu.tsx', import.meta.url), 'utf8')
const htmlControlsSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/PreviewHeaderHtmlControls.tsx', import.meta.url), 'utf8')
const folderTreeHookSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/usePreviewFolderTree.ts', import.meta.url), 'utf8')
const modalAnalysisSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/useFilePreviewModalAnalysis.tsx', import.meta.url), 'utf8')
const settingsSource = readFileSync(new URL('../src/renderer/src/lib/settings.tsx', import.meta.url), 'utf8')
const desktopPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { dependencies?: Record<string, string> }
assert.equal(modalSource.includes('useFilePreviewNavigationHistory'), true, 'the shared modal owns one visit history for linked files and tab selections')
assert.equal(windowedHeaderSource.includes('<PreviewHistoryNavigation'), true, 'windowed previews expose Back and Forward beside the file identity')
assert.equal(expandedHeaderSource.includes('<PreviewHistoryNavigation'), true, 'expanded previews expose the same navigation before the tab strip')
assert.equal(windowedHeaderSource.includes('ml-auto shrink-0'), true, 'windowed file actions form a right-aligned cluster instead of interrupting file identity')
assert.equal(windowedHeaderSource.includes('group-hover/file:opacity-100'), true, 'copy path stays quiet until the file identity is engaged')
assert.equal(windowedHeaderSource.includes('h-4 w-px shrink-0'), true, 'a single divider separates navigation from file identity')
assert.equal(historyNavigationSource.includes("expanded\n                ? 'h-full border-r"), true, 'only expanded navigation uses a surrounding chrome boundary')
assert.equal(historyHookSource.includes('requestExternalIntent(() =>'), true, 'history traversal preserves the unsaved-edit confirmation flow')
assert.equal(historyHookSource.includes('onBeforeNavigate?.(target.entry.file.path)'), true, 'history traversal keeps the file-tree context synchronized')
assert.equal(layoutSource.includes('windowedNavigatorEnabled ? ('), true, 'tagged targets mount the file navigator inside the windowed preview modal')
assert.equal(layoutSource.includes('navigationSidebar'), true, 'windowed and expanded previews reuse the existing full navigator')
assert.equal(previewHookSource.includes("options?.targetKind === 'directory'"), true, 'preview state represents directory targets without inventing a fake file')
assert.equal(previewHookSource.includes('options?.revealNavigatorTarget === true'), true, 'link-origin reveal intent receives a unique preview request')
assert.equal(assistantNavigationSource.includes("targetKind: 'directory'"), true, 'assistant directory tags open the preview navigator')
assert.equal(assistantNavigationSource.includes('revealNavigatorTarget: true'), true, 'assistant file links explicitly request one navigator reveal')
assert.equal(markdownNavigationSource.includes('revealNavigatorTarget: true'), true, 'Markdown file links explicitly request one navigator reveal')
assert.equal(historyHookSource.includes('revealNavigatorTarget'), false, 'Back and Forward navigation cannot reclaim the tree viewport')
assert.equal(assistantNavigationSource.includes('/folder-browse/'), false, 'assistant directory tags no longer leave chat for the folder-browse route')
assert.equal(desktopPackage.dependencies?.['@pierre/trees'], undefined, 'the preview Explorer has no third-party tree runtime')
assert.equal(virtualTreeSource.includes('@pierre/trees'), false, 'the virtual tree does not retain a hidden Pierre adapter')
assert.equal(sidebarSource.includes('<PreviewVirtualFileTree'), true, 'the preview navigator renders through Zyra’s focused virtual tree')
assert.equal(sidebarSource.includes('tracking-[0.14em]'), false, 'the redundant standalone Explorer title row is removed')
assert.equal(sidebarSource.includes('File map'), false, 'the Explorer-only surface removes the app-style File map tab')
assert.equal(sidebarSource.includes('ExplorerCreateIcon'), true, 'new file and folder actions use compact layered entry glyphs')
assert.equal(sidebarSource.includes("startCreate('file', treeRootPath)"), true, 'workspace actions create from the actual Explorer root')
assert.equal(sidebarSource.includes('Collapse Folders in Explorer'), true, 'the workspace header exposes the standard collapse-all action')
assert.equal(modalAnalysisSource.includes('extractOutlineItems'), false, 'removed File map parsing does not continue in hidden preview work')
assert.equal(sidebarSource.includes('DraggablePreviewFileRow'), false, 'the custom file-row renderer is no longer in the production sidebar')
assert.equal(sidebarSource.includes('<span>Up</span>'), false, 'the duplicate bottom Up navigation is removed')
assert.equal(sidebarSource.includes('<span>Prev</span>'), false, 'the duplicate bottom history navigation is removed')
assert.equal(sidebarSource.includes('<span>Next</span>'), false, 'the top Back and Forward controls remain the only history surface')
assert.equal(folderTreeHookSource.includes('maxDepth: 0'), true, 'the project tree loads one directory level at a time instead of blocking preview startup')
assert.equal(virtualTreeSource.includes('requestDirectoryLoad(node)'), true, 'expanding a virtual directory lazily loads its real filesystem children')
assert.equal(virtualTreeSource.includes('onWheel={handleTreeWheel}'), false, 'the tree does not replace native scrolling with scrollTop writes')
assert.equal(virtualWindowSource.includes("addEventListener('scroll', scheduleRangeUpdate, { passive: true })"), true, 'the viewport uses one passive native scroll listener')
assert.equal(virtualWindowSource.includes('window.requestAnimationFrame'), true, 'scroll range work is coalesced to animation frames')
assert.equal(virtualTreeSource.includes('buildVisiblePreviewTreeModel(nodes, expandedKeys)'), true, 'hierarchy, lookup indexes, and width are built once when tree or expansion state changes')
assert.equal(virtualTreeSource.includes('rows.slice(range.start, range.end)'), true, 'only the virtual row window reaches React rendering')
assert.equal(virtualTreeSource.includes('group-hover/tree-row:opacity-100'), true, 'row actions stay quiet until the row is engaged, like an editor explorer')
assert.equal(virtualTreeSource.includes("nameLayout === 'wrap' ? 40 : 24"), true, 'wrapped and horizontal modes keep known fixed row heights')
assert.equal(virtualTreeSource.includes("nameLayout === 'horizontal' ? 'overflow-auto'"), true, 'full names can use a horizontally scrollable tree')
assert.equal(settingsSource.includes("filePreviewExplorerNameLayout: 'wrap'"), true, 'the chosen filename layout has a persistent default')
assert.equal(virtualTreeSource.includes("scrollToIndex(targetIndex, 'auto')"), true, 'a linked target moves only far enough to enter the viewport')
assert.equal(virtualTreeSource.includes("scrollToIndex(targetIndex, 'top')"), false, 'linked targets are never forced to the top edge')
assert.equal(virtualTreeSource.includes('appliedRevealRequestsRef.current.has(revealTargetRequestId)'), true, 'each link-origin reveal request is consumed once')
assert.equal(modalSource.includes('handledNavigatorRevealRequests'), true, 'layout remounts and tab changes cannot replay a consumed reveal request')
assert.equal(virtualTreeSource.includes('appliedAutoExpansionPathsRef.current.has(pathKey)'), true, 'automatic ancestor expansion does not reopen folders the user collapsed')
assert.equal(virtualTreeSource.includes('appliedCollapseAllRequestRef'), true, 'Explorer collapse-all updates expansion state without rebuilding a package model')
assert.equal(sidebarSource.includes("selectedPathKind={file.type === 'directory' ? 'directory' : 'file'}"), true, 'directory previews reveal the directory itself, not an absent file target')
assert.equal(folderTreeHookSource.includes('The virtual tree owns live expansion state'), true, 'folder expansion avoids a redundant visible-row flatten before loading')
assert.equal(folderTreeHookSource.includes('background: true'), false, 'a fresh cached tree is not silently replaced while the user starts scrolling')
assert.equal(folderTreeHookSource.includes('latestRequestByPathRef'), true, 'independent folder loads do not cancel each other')
assert.equal(folderTreeHookSource.includes('toggleDirectory'), false, 'dead navigation logic from the retired custom tree is removed')
assert.equal(treeMenuSource.includes('createPortal('), true, 'tree action menus leave the clipping sidebar stack')
assert.equal(treeMenuSource.includes('z-[360]'), true, 'tree action menus paint above the preview editor')
assert.equal(htmlControlsSource.includes('border border-white/[0.07] bg-transparent'), true, 'the HTML viewport button inherits the color of its control section')
assert.equal(htmlControlsSource.includes("'border border-white/[0.08] bg-[#111927] p-1"), true, 'the floating HTML viewport menu keeps an opaque surface')
assert.equal(windowedHeaderSource.indexOf('PanelLeftClose size') < windowedHeaderSource.indexOf('<PreviewHistoryNavigation'), true, 'the stateful sidebar toggle sits before Back and Forward in windowed previews')
assert.equal(expandedHeaderSource.indexOf('PanelLeftClose size') < expandedHeaderSource.indexOf('<PreviewHistoryNavigation'), true, 'expanded previews keep the same left-side toggle order')

console.log('File preview navigation contract: ok')
