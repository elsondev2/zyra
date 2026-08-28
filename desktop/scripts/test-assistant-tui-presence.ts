import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hasAssistantTuiPresence, isAssistantSessionOpenInTui } from '../src/renderer/src/pages/assistant/assistant-tui-presence'
import { resolveAssistantAgentInboxSettledInitialCount } from '../src/renderer/src/pages/assistant/assistant-agent-inbox-settled-window'

const tuiPresence = {
    state: 'ready',
    clients: [{ clientId: 'desktop:1', surface: 'desktop' }, { clientId: 'tui:1', surface: 'tui' }]
}
const desktopPresence = {
    state: 'ready',
    clients: [{ clientId: 'desktop:1', surface: 'desktop' }]
}

assert.equal(hasAssistantTuiPresence(tuiPresence), true)
assert.equal(hasAssistantTuiPresence(desktopPresence), false)
assert.equal(hasAssistantTuiPresence(null), false)
assert.equal(isAssistantSessionOpenInTui({
    threads: [
        { canonicalPresence: desktopPresence },
        { canonicalPresence: tuiPresence }
    ]
} as any), true, 'a chat row reflects TUI presence from any of its own canonical threads')
assert.equal(isAssistantSessionOpenInTui({ threads: [{ canonicalPresence: desktopPresence }] } as any), false)
assert.equal(resolveAssistantAgentInboxSettledInitialCount(0), 1)
assert.equal(resolveAssistantAgentInboxSettledInitialCount(36), 1)
assert.equal(resolveAssistantAgentInboxSettledInitialCount(38), 2)
assert.equal(resolveAssistantAgentInboxSettledInitialCount(185), 5)

const indicatorSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantTuiPresenceIndicator.tsx', import.meta.url), 'utf8')
const headerSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantConversationHeader.tsx', import.meta.url), 'utf8')
const railSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantChatSessionsRail.tsx', import.meta.url), 'utf8')
const selectionSource = readFileSync(new URL('../src/renderer/src/lib/assistant/assistant-store-selection-helpers.ts', import.meta.url), 'utf8')
const inboxSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantAgentInboxSidebar.tsx', import.meta.url), 'utf8')

assert.match(indicatorSource, /SquareTerminal/, 'TUI presence is represented by one terminal icon')
assert.match(indicatorSource, /This session is open in the TUI/, 'hover and keyboard focus expose the requested status copy')
assert.match(indicatorSource, /createPortal[\s\S]*role="tooltip"/, 'the tooltip escapes clipped header and sidebar rows')
assert.match(indicatorSource, /transition-\[opacity,transform\][\s\S]*duration-\[140ms\]/, 'the tooltip fades in and out without heavy motion')
assert.match(indicatorSource, /text-\[var\(--status-success\)\]/, 'the icon uses Zyra’s semantic green success color')
assert.match(indicatorSource, /compact \? 12 : 15/, 'the header icon is larger while dense chat rows stay compact')
assert.doesNotMatch(indicatorSource, /hover:scale|focus-visible:scale/, 'hover and focus never move or grow the presence icon')
assert.match(headerSource, /hasAssistantTuiPresence\(canonicalPresence\)[\s\S]*<AssistantTuiPresenceIndicator/, 'the selected chat header uses canonical TUI client presence')
assert.doesNotMatch(headerSource, /surface === 'tui' \? 'TUI'/, 'the old text-heavy TUI badge is removed')
assert.match(railSource, /isAssistantSessionOpenInTui\(session\)[\s\S]*<AssistantTuiPresenceIndicator focusable=\{false\} compact/, 'each chat row shows its own compact TUI presence icon')
assert.match(railSource, /hasAssistantTuiPresence\(thread\.canonicalPresence\)[\s\S]*<AssistantTuiPresenceIndicator focusable=\{false\} compact/, 'visible nested thread rows preserve thread-specific TUI presence')
assert.match(selectionSource, /presence\?\.clients[\s\S]*client\.clientId[\s\S]*client\.surface/, 'rail equality invalidates when TUI clients attach or detach without changing turn state')
assert.match(inboxSource, /tuiOpen: isAssistantSessionOpenInTui\(session\)/, 'Inbox items derive TUI presence from their own canonical chat')
assert.equal((inboxSource.match(/<AssistantTuiPresenceIndicator focusable=\{false\}/g) || []).length, 2, 'both Inbox card and slim-row presentations show the TUI icon')
assert.doesNotMatch(inboxSource, /AssistantTuiPresenceIndicator focusable=\{false\} compact/, 'Inbox uses the slightly larger terminal icon')
assert.match(inboxSource, /absolute bottom-1\.5 right-2[\s\S]*<AssistantTuiPresenceIndicator focusable=\{false\}/, 'Inbox cards place TUI presence at the bottom-right corner')
assert.match(inboxSource, /function AgentInboxSlimRow[\s\S]*<AssistantTuiPresenceIndicator focusable=\{false\}[\s\S]*formatAssistantSidebarRelativeTime\(item\.activityAt\)/, 'Inbox slim rows align TUI presence before relative time')
assert.match(railSource, /\{tuiOpen \? <AssistantTuiPresenceIndicator[\s\S]*\{timeLabel\}/, 'standard chat rows align TUI presence before relative time')
assert.match(inboxSource, /function InboxRowActions[\s\S]*pointer-events-none absolute right-0 top-1\/2[\s\S]*showLabel \? 'w-\[4\.75rem\]' : 'w-\[3\.25rem\]'/, 'Inbox actions overlay a fixed trailing slot without changing the row width')
assert.match(inboxSource, /group-hover\/agent-inbox-row:-translate-x-9[\s\S]*<AssistantTuiPresenceIndicator focusable=\{false\}/, 'the terminal presence icon still slides left to clear the fixed action slot')
assert.match(inboxSource, /translate-x-1 -translate-y-1\/2[\s\S]*group-hover\/agent-inbox-row:translate-x-0/, 'Inbox actions retain their restrained slide-in motion without layout reflow')
assert.doesNotMatch(inboxSource, /group-hover\/agent-inbox-row:grid-cols-\[0fr\]/, 'Inbox hover actions cannot reflow or newly trim the row title')
assert.match(inboxSource, /data-agent-inbox-layout-id[\s\S]*useLayoutEffect[\s\S]*cubic-bezier\(0\.22, 1, 0\.36, 1\)/, 'Inbox rows animate smoothly between Settled, Recent, and Active work')
assert.match(inboxSource, /measureSettledInitialWindow[\s\S]*headerBounds\.bottom - scrollerBounds\.top \+ scroller\.scrollTop[\s\S]*scrollerBounds\.height - headerContentBottom/, 'the initial Settled batch is measured from the remaining at-rest sidebar height even after the list scrolls')
assert.match(inboxSource, /new ResizeObserver\(measureSettledInitialWindow\)/, 'resizing the sidebar recomputes the visible Settled batch')
assert.doesNotMatch(inboxSource, /SETTLED_INITIAL_COUNT/, 'Settled no longer renders an arbitrary fixed first batch')
assert.match(inboxSource, /See \{Math\.min\(hiddenSettledCount, SETTLED_PAGE_COUNT\)\} more/, 'the next Settled page is disclosed only after the viewport-sized first batch')
assert.match(railSource, /shrink-0 transition-opacity[\s\S]*group-hover:opacity-0[\s\S]*pointer-events-none absolute right-2\.5/, 'standard row metadata keeps a stable width while the action button overlays its right edge')
assert.doesNotMatch(railSource, /group-hover:grid-cols-\[0fr\]/, 'chat actions do not squeeze active-row titles or status metadata')
assert.doesNotMatch(railSource, /group-focus-within:(?:pointer-events-auto|opacity-100)/, 'selecting or focusing the active chat row cannot pin its ellipsis action open')

console.log('Assistant TUI presence indicators: ok')
