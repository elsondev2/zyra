import { flushSync } from 'react-dom'
import type { Root } from 'react-dom/client'
import { AssistantTimeline } from '../../src/renderer/src/pages/assistant/AssistantTimeline'
import type { AssistantMessage, AssistantSessionTurnUsageEntry } from '../../src/shared/assistant/contracts'

export async function checkConversationMarkers(root: Root): Promise<string[]> {
    const first = '2026-10-02T10:00:00.000Z', second = '2026-10-02T12:00:00.000Z'
    const messages: AssistantMessage[] = [
        { id: 'prompt-one', role: 'user', text: 'First prompt', turnId: 'one', timelineSequence: 1, streaming: false, createdAt: first, updatedAt: first },
        { id: 'answer-one', role: 'assistant', text: 'First answer.', turnId: 'one', timelineSequence: 3, streaming: false, createdAt: '2026-10-02T10:01:00.000Z', updatedAt: '2026-10-02T10:01:00.000Z' },
        { id: 'prompt-two', role: 'user', text: 'Next prompt', turnId: 'two', timelineSequence: 4, streaming: false, createdAt: second, updatedAt: second },
        { id: 'answer-two', role: 'assistant', text: 'Next answer.', turnId: 'two', timelineSequence: 5, streaming: false, createdAt: '2026-10-02T12:01:00.000Z', updatedAt: '2026-10-02T12:01:00.000Z' }
    ]
    const turns = new Map<string, AssistantSessionTurnUsageEntry>(['one', 'two'].map((id, index) => [id, {
        id, model: index ? 'openai-codex/gpt-6-astra' : 'openai-codex/gpt-6.1-sol', sessionId: 'session', threadId: 'thread', state: 'completed',
        requestedAt: index ? second : first, startedAt: index ? second : first, completedAt: index ? second : first,
        assistantMessageId: `answer-${id}`, usage: null, updatedAt: index ? second : first
    }]))
    const pendingTurns = new Map(turns)
    pendingTurns.set('two', { ...turns.get('two')!, state: 'running', completedAt: null, assistantMessageId: null })
    flushSync(() => root.render(<div className="h-full w-full"><AssistantTimeline messages={messages.slice(0, 3)}
        activities={[{ id: 'read', kind: 'read', tone: 'tool', summary: 'Reading fixture.ts', turnId: 'one', timelineSequence: 2, createdAt: first }]}
        turnUsageById={pendingTurns} isWorking isConnecting workingLabel="Connecting" latestTurnStartedAt={second}
        windowKey="marker-fixture" assistantTextStreamingMode="instant" latestAssistantMessageId="answer-one" /></div>))
    const deadline = performance.now() + 5000
    while (!document.querySelector('[data-assistant-model-change]') && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 30))
    const check = (value: unknown, label: string) => { if (!value) throw new Error(label) }
    const model = document.querySelector<HTMLElement>('[data-assistant-model-change]')!
    const time = document.querySelector<HTMLElement>('[data-assistant-conversation-time]')!
    const prompt = document.querySelector<HTMLElement>('[data-assistant-timeline-row-id="prompt-two"]')!
    check(model?.textContent?.includes('Model changed from gpt-6.1-sol to gpt-6-astra'), 'Actual timeline renders the saved model switch')
    check(time?.querySelector('time')?.dateTime === second && !time.querySelector('.h-px,hr'), 'Inactivity uses a centered timestamp without a divider')
    check(model.querySelectorAll('.h-px').length === 2, 'Model switch has quiet lines on each side')
    check(getComputedStyle(model).display === 'flex' && getComputedStyle(time).textAlign === 'center', 'Real app CSS styles both markers')
    check(Boolean(time.compareDocumentPosition(model) & Node.DOCUMENT_POSITION_FOLLOWING) && Boolean(model.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING), 'Both markers appear before the new prompt in chronological order')
    check(!model.closest('[data-assistant-turn-work-summary]') && !time.closest('[data-assistant-turn-work-summary]'), 'Conversation boundaries stay outside work blocks')
    const bounds = model.getBoundingClientRect()
    check(bounds.width > 300 && bounds.height < 60 && bounds.right <= window.innerWidth, 'The model divider fits the chat rail')
    check(!document.body.textContent?.includes('Next answer.'), 'The model marker is already rendered before the next model responds')
    flushSync(() => root.render(<div className="h-full w-full"><AssistantTimeline messages={messages} activities={[]}
        turnUsageById={turns} windowKey="marker-fixture" assistantTextStreamingMode="instant" latestAssistantMessageId="answer-two" /></div>))
    await new Promise(resolve => setTimeout(resolve, 100))
    check(document.querySelectorAll('[data-assistant-model-change]').length === 1, 'Connection completion keeps exactly one model-change marker')
    root.unmount()
    return ['actual AssistantTimeline and virtual list render the model divider and centered idle timestamp before the next prompt, outside collapsed work; real CSS and rail bounds pass']
}
