import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { DndContext } from '@dnd-kit/core'
import { Settings, PanelsTopLeft } from 'lucide-react'
import { AppSubmenu } from '../../src/renderer/src/components/layout/AppSubmenu'
import { PreviewTabStrip } from '../../src/renderer/src/components/ui/file-preview/PreviewTabStrip'
import { AssistantPreviewResourceNavigator } from '../../src/renderer/src/pages/assistant/AssistantPreviewResourceNavigator'
import { TerminalSessionConnector } from '../../src/renderer/src/pages/assistant/TerminalSessionConnector'
import type { AssistantDiffTurn } from '../../src/renderer/src/pages/assistant/assistant-diff-types'
import type { PreviewTab } from '../../src/renderer/src/components/ui/file-preview/types'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
const opens: Array<{ path: string; options: unknown }> = []
Object.assign(window, { devscope: { getPathInfo: async (path: string) => ({ success: true, exists: true, type: 'file', path }) } })
const image = (color: string) => `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="${color}"/><circle cx="60" cy="40" r="22" fill="#ffffff88"/></svg>`)}`
const path = 'C:/synthetic-chat/6dd38ad8c2619880226fce10.png'
const secondPath = 'C:/synthetic-chat/75bcf031a5275265908287d4.png'
const turns = [{ id: 'turn-four', number: 4, state: 'completed', reviewStatus: 'latest', createdAt: '2026-01-01T00:00:00Z', prompt: '', response: '', changes: [], files: [], promptAttachments: [
    { id: 'one', name: '6dd38ad8c2619880226fce10.png', type: 'IMAGE', path, mime: 'image/png', content: image('#6f537e') },
    { id: 'two', name: '75bcf031a5275265908287d4.png', type: 'IMAGE', path: secondPath, mime: 'image/png', content: image('#297c85') }
] }] as unknown as AssistantDiffTurn[]
const tabs = [path, secondPath].map((filePath, index) => ({ id: `tab-${index}`, file: { name: filePath.split('/').pop()!, path: filePath, type: 'image', displayName: `Turn 4 · Attachment ${index + 1}` } })) as PreviewTab[]
const host = document.createElement('div')
document.body.append(host)
const root = createRoot(host)
const onOpenPreview = async (file: { name: string; path: string }, _ext: string, options?: unknown) => { opens.push({ path: file.path, options }) }
function Fixture({ width }: { width: number }) {
    return <div className="p-6 text-sparkle-text text-xs">
        <div className="mb-4 h-9 border border-white/10 p-1"><DndContext><PreviewTabStrip tabs={tabs} activeTabId="tab-0" iconTheme="dark" onSelectTab={() => {}} onCloseTab={() => {}} /></DndContext></div>
        <div className="flex gap-6">
            <div data-resource-width style={{ width, height: 340 }}><AssistantPreviewResourceNavigator turns={turns} projectPath={null} activeFilePath={path} onOpenPreview={onOpenPreview} onOpenUrl={() => {}} /></div>
            <div className="w-52 space-y-4">
                <div className="rounded-xl border border-white/10 bg-sparkle-card p-1">
                    <button data-settings-row className="flex h-8 w-full items-center gap-3 rounded-lg px-2.5 text-left"><span className="inline-flex size-4 shrink-0 items-center justify-center"><Settings size={13} /></span><span>Settings</span></button>
                    <AppSubmenu label="View" icon={<PanelsTopLeft size={13} />} items={[]} />
                </div>
                <div data-terminal-group className="bg-sparkle-card">
                    {['Server', 'Client', 'Worker', 'Logs'].map((name, index) => <div key={name} className="relative flex h-11 items-start px-2 py-1.5"><TerminalSessionConnector index={index} count={4} status={index === 2 ? 'error' : 'running'} /><div className="pl-4"><div className="h-4 leading-4">{name}</div><div className="mt-0.5 text-[9px] text-sparkle-text-muted">C:/project</div></div></div>)}
                </div>
            </div>
        </div>
    </div>
}
const delay = () => new Promise(resolve => setTimeout(resolve, 25))
async function settle(predicate: () => boolean, message: string) {
    for (let attempt = 0; attempt < 80; attempt++) { await act(async () => { await delay() }); if (predicate()) return }
    throw new Error(message)
}
Object.assign(window, { sidebarTargetCheck: (async () => {
    await act(async () => root.render(<Fixture width={320} />))
    await settle(() => document.querySelectorAll('[aria-label="Resource cards"] img').length === 2, 'wide sidebar renders real resource thumbnails')
    await settle(() => [...document.querySelectorAll<HTMLImageElement>('[aria-label="Resource cards"] img')].every(img => img.complete && img.naturalWidth > 0), 'thumbnails finish loading')
    check(document.querySelector('[aria-label="Resource cards"]')?.textContent?.includes('Turn 4 · Attachment 1'), 'readable labels reach resource cards')
    const settingsLabel = document.querySelector('[data-settings-row] > span:last-child')!.getBoundingClientRect()
    const viewLabel = document.querySelector('[aria-haspopup="menu"] > span:nth-child(2)')!.getBoundingClientRect()
    check(Math.abs(settingsLabel.left - viewLabel.left) < 0.5, 'View label aligns with Settings')
    const group = document.querySelector('[data-terminal-group]')!
    const dashes = [...group.querySelectorAll('[data-terminal-status-dash]')].map(el => el.getBoundingClientRect())
    check(dashes.length === 4 && dashes.every(rect => rect.width === 12 && rect.height === 1), 'each terminal uses a compact horizontal status dash')
    const stems = [...group.querySelectorAll('[data-terminal-connector]')].map(el => el.getBoundingClientRect()).sort((a, b) => a.top - b.top)
    check(stems.length === 6 && stems.every((rect, i) => !i || Math.abs(rect.top - stems[i - 1].bottom) < 0.5), 'multi-session branches form one continuous vertical line')
    check(document.querySelector('[title="Close Turn 4 · Attachment 1"]'), 'preview tabs use display labels')
    await act(async () => (document.querySelectorAll<HTMLElement>('[aria-label="Resource cards"] [role="listitem"]')[1]).click())
    await settle(() => opens.length === 1, 'one click opens a resource')
    check(opens[0].path === secondPath && (opens[0].options as { displayName: string }).displayName === 'Turn 4 · Attachment 2', 'click reaches the exact image with its readable preview label')
    await act(async () => root.render(<Fixture width={220} />))
    await settle(() => document.querySelector('[aria-label="Chat resources table"]') != null, 'narrow sidebar uses thumbnail rows')
    check(document.querySelectorAll('[aria-label="Chat resources table"] img').length === 2, 'compact rows retain image previews')
    return ['wide and narrow resource thumbnails', 'single-click exact resource opening', 'readable labels in preview tabs', 'aligned View menu label', 'continuous terminal branches with status dashes']
})() })
