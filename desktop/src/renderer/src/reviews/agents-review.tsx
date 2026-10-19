import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { AgentTranscriptPage, FleetSnapshot } from '@shared/assistant/contracts'
import { SettingsProvider } from '@/lib/settings'
import MarkdownRenderer from '@/components/ui/MarkdownRenderer'
import { AssistantFleetWorkspace } from '@/pages/assistant/AssistantFleetWorkspace'
import { createWorkflowReviewSeed } from './agents-review-workflow-fixture'
import '@/styles/theme-tokens.css'
import '@/index.css'

interface ReviewSeed {
    title: string
    threadId: string
    savedAt: string
    snapshot: FleetSnapshot
    transcripts: Record<string, AgentTranscriptPage['entries']>
    messages: { id: string; role: string; text: string; createdAt: string }[]
}

const workflowReviewCapsule = { version: 1, workspace: 'agents', section: 'workflows' } as const

function Review({ seed }: { seed: ReviewSeed }) {
    const workflowDemo = seed.threadId === 'demo-thread'
    const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
    const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null)
    const [narrow, setNarrow] = useState(false)
    const [showChat, setShowChat] = useState(false)
    return <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', color: 'var(--color-text)' }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--surface-divider)', fontSize: 11 }}>
            <div style={{ minWidth: 0 }}><span style={{ color: 'var(--accent-primary)' }}>Read-only design preview</span><div style={{ marginTop: 4 }}>{seed.title}</div></div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', color: 'var(--color-text-muted)' }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Dataset
                    <select aria-label="Review dataset" value={workflowDemo ? 'workflows-demo' : 'saved'}
                        style={{ background: 'var(--surface-floating)', color: 'var(--color-text)', border: '1px solid var(--surface-divider)', borderRadius: 4, padding: '4px 6px' }}
                        onChange={event => { const url = new URL(window.location.href); url.searchParams.set('dataset', event.target.value); window.location.assign(url.href) }}>
                        <option value="saved">Saved agents</option><option value="workflows-demo">Workflow demo · synthetic</option>
                    </select>
                </label>
                <button onClick={() => setNarrow(value => !value)} aria-pressed={narrow}>{narrow ? 'Use full width' : 'Inspector width'}</button>
                {seed.messages.length ? <button onClick={() => setShowChat(value => !value)} aria-expanded={showChat}>{showChat ? 'Close chat context' : 'Chat context'}</button> : null}
            </div>
        </header>
        <main style={{ display: 'flex', flex: 1, minHeight: 0, justifyContent: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', width: narrow ? 520 : '100%', maxWidth: '100%', minHeight: 0 }}>
                <AssistantFleetWorkspace threadId={seed.threadId} snapshot={seed.snapshot} selectedAgentRunId={selectedAgent} selectedWorkflowRunId={selectedWorkflow}
                    stateCapsule={workflowDemo ? workflowReviewCapsule : undefined}
                    onSelectAgent={setSelectedAgent} onSelectWorkflow={setSelectedWorkflow} />
            </div>
            {showChat ? <aside style={{ width: 360, maxWidth: '45%', minWidth: 0, overflow: 'auto', borderLeft: '1px solid var(--surface-divider)', padding: 20 }}>
                <h2 style={{ fontSize: 13, marginBottom: 8 }}>Saved chat context</h2>
                <p style={{ fontSize: 10, color: 'var(--color-text-muted)', marginBottom: 20 }}>Latest {seed.messages.length} messages. Agent rows open their own saved transcripts.</p>
                {seed.messages.map(message => <article key={message.id} style={{ borderTop: '1px solid var(--surface-divider)', padding: '14px 0', fontSize: 11 }}>
                    <div style={{ marginBottom: 8, color: 'var(--color-text-muted)', fontSize: 10 }}>{message.role === 'user' ? 'You' : 'Zyra'}</div>
                    <MarkdownRenderer content={message.text} cacheKey={`demo:${message.id}`} lightweight deferCodeHighlighting />
                </article>)}
            </aside> : null}
        </main>
    </div>
}

async function start() {
    const workflowDemo = new URLSearchParams(window.location.search).get('dataset') === 'workflows-demo'
    let seed: ReviewSeed
    if (workflowDemo) seed = createWorkflowReviewSeed()
    else {
        const response = await fetch('/__agent-review-seed')
        if (!response.ok) throw new Error('Local review data is unavailable.')
        seed = await response.json()
    }
    // This preview can read only the in-memory snapshot. It has no connection
    // to the running agent service and cannot stop, retry, or start real work.
    const preferenceSnapshot = () => ({ version: 1, revision: 0, desktopLegacyMigrationComplete: true,
        settings: { settingsSchemaVersion: 5, theme: 'vercel', appearanceThemeMode: 'dark', appearanceDarkTheme: 'vercel' } })
    Object.assign(window, { devscope: {
        preferences: { get: async () => ({ success: true, snapshot: preferenceSnapshot() }), onChanged: () => () => {},
            update: async () => ({ success: true, snapshot: preferenceSnapshot() }) },
        secrets: { migrateLegacyHostedAiKeys: async () => ({ success: true, status: { groqConfigured: false, geminiConfigured: false, legacyMigrationComplete: true } }) },
        assistant: {
        agentAction: async ({ action, payload }: { action: string; payload: { agentRunId: string; before?: number; after?: number; limit?: number } }) => {
            if (action !== 'transcript') return { success: false, error: 'This is a read-only design preview.' }
            const all = seed.transcripts[payload.agentRunId] || []
            const eligible = all.filter(entry => (payload.before == null || entry.index < payload.before)
                && (payload.after == null || entry.index > payload.after))
            const limit = Math.min(payload.limit || 30, 50)
            const entries = payload.after == null ? eligible.slice(-limit) : eligible.slice(0, limit)
            const first = entries[0]?.index
            const last = entries.at(-1)?.index
            return { success: true, result: { entries, totalEntries: all.length, hydrated: entries.length,
                nextBefore: first != null && all.some(entry => entry.index < first) ? first : null,
                nextAfter: last != null && all.some(entry => entry.index > last) ? last : null,
                bytes: JSON.stringify(entries).length, truncatedEntries: 0 } }
        }
    } } })
    createRoot(document.getElementById('root')!).render(<SettingsProvider><Review seed={seed} /></SettingsProvider>)
}
void start().catch(error => { document.getElementById('root')!.textContent = error.message })
