import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { collapseNestedProjects, isSystemProjectPath, isWithinPath, projectTags, sortPortfolioProjects } from '../src/renderer/src/pages/accessories/devscopePortfolioPaths'
import { DevScopePagination } from '../src/renderer/src/pages/accessories/DevScopePagination'
import { DevScopePortfolioToolbar } from '../src/renderer/src/pages/accessories/DevScopePortfolioToolbar'
import { scanLocation } from '../src/renderer/src/pages/accessories/useDevScopePortfolio'
import { matchGitHubRemote } from '../src/main/services/devscope-github-discovery'

const paths = collapseNestedProjects([
    { path: 'C:\\Users\\developer\\my_coding_play\\zyra\\desktop' },
    { path: 'C:\\Users\\developer\\AppData\\Local\\Programs\\Zyra' },
    { path: 'C:\\Users\\developer\\my_coding_play\\zyra' },
    { path: 'C:\\Users\\developer\\my_coding_play\\playground\\pianora' },
    { path: 'C:\\Users\\developer\\my_coding_play\\zyra\\.zyra-worktrees\\branch' }
])
assert.deepEqual(paths.map(item => item.path), [
    'C:\\Users\\developer\\my_coding_play\\zyra',
    'C:\\Users\\developer\\my_coding_play\\playground\\pianora'
])
assert.equal(isWithinPath('C:\\code\\zyra', 'C:\\code\\zyra\\desktop'), true)
assert.equal(isWithinPath('C:\\code\\zyra', 'C:\\code\\zyra-other'), false)
assert.equal(isSystemProjectPath('C:\\Users\\developer\\AppData\\Local\\Programs\\Zyra'), true)
assert.deepEqual(projectTags({ path: 'C:\\code\\zyra', name: 'zyra', type: 'node', frameworks: ['typescript', 'react'], markers: ['package.json'], isProject: true }), ['Node.js', 'TypeScript', 'React'])
const activity = [
    { path: 'C:/coding/older', name: 'older', lastModified: 100 },
    { path: 'C:/coding/newer', name: 'newer', lastModified: 200 }
]
assert.deepEqual(sortPortfolioProjects(activity, 'recent').map(item => item.name), ['newer', 'older'])
assert.deepEqual(sortPortfolioProjects(activity, 'oldest').map(item => item.name), ['older', 'newer'])
assert.deepEqual(sortPortfolioProjects(activity, 'name').map(item => item.name), ['newer', 'older'])
const pager = renderToStaticMarkup(createElement(DevScopePagination, { page: 2, pageSize: 24, total: 53, onPageChange: () => {}, onPageSizeChange: () => {} }))
assert.match(pager, /25–48 of 53 projects/)
assert.match(pager, /Previous page/)
assert.match(pager, /Next page/)
assert.doesNotMatch(pager, /Show more/)
const toolbar = renderToStaticMarkup(createElement(DevScopePortfolioToolbar, {
    query: '', onQueryChange: () => {}, searchField: 'both', onSearchFieldChange: () => {},
    sortOrder: 'recent', onSortOrderChange: () => {}, view: 'list', onViewChange: () => {},
    refreshing: false, onRefresh: () => {}
}))
assert.match(toolbar, /Latest activity/)
assert.match(toolbar, /aria-label="Search projects"/)
assert.match(toolbar, /placeholder="Search projects or paths"/)
assert.match(toolbar, /focus-within:border-/)
const scannedPaths: string[] = []
const project = (path: string, type: string) => ({ name: path.split('/').pop() || path, path, type, markers: ['package.json'], frameworks: [], isProject: true })
Object.assign(globalThis, { window: { devscope: {
    getProjectDetails: async () => ({ success: true, project: { markers: [], type: 'unknown', frameworks: [] } }),
    scanProjects: async (path: string) => {
        scannedPaths.push(path)
        if (path === 'C:/coding') return { success: true, projects: [project('C:/coding/zyra', 'node')], folders: [
            { path: 'C:/coding/tools' }, { path: 'C:/coding/AppData' }
        ] }
        if (path === 'C:/coding/tools') return { success: true, projects: [project('C:/coding/tools/utility', 'python')], folders: [] }
        throw new Error(`Unexpected scan of ${path}`)
    }
} } })
const discovered = await scanLocation('C:/coding', false)
assert.deepEqual(discovered.map(item => item.path), ['C:/coding/zyra', 'C:/coding/tools/utility'])
assert.deepEqual(scannedPaths, ['C:/coding', 'C:/coding/tools'])
assert.deepEqual(matchGitHubRemote('C:/coding/zyra', [
    { name: 'origin', fetchUrl: 'git@github.com:owner/zyra.git', pushUrl: '' }
], new Set(['owner/zyra'])), { path: 'C:/coding/zyra', fullName: 'owner/zyra' })
console.log('PASS: DevScope nested projects, system paths, discovery, technology labels, and local GitHub matching')
