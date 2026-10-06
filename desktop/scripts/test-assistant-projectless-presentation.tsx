import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SettingsProvider } from '../src/renderer/src/lib/settings'
import type { AssistantSession, AssistantThread } from '../src/shared/assistant/contracts'
import { AssistantAgentInboxSidebar } from '../src/renderer/src/pages/assistant/AssistantAgentInboxSidebar'
import { AssistantNewChatProjectChip } from '../src/renderer/src/pages/assistant/AssistantNewChatProjectChip'
import { AssistantNewChatGreeting } from '../src/renderer/src/pages/assistant/AssistantNewChatGreeting'
import { AssistantConversationHeader } from '../src/renderer/src/pages/assistant/AssistantConversationHeader'
import { ProjectsStep } from '../src/renderer/src/onboarding/OnboardingSteps'
import { getAssistantNewChatGreeting } from '../src/renderer/src/pages/assistant/assistant-new-chat-greeting'
import { resolveAssistantProjectLabel } from '../src/renderer/src/pages/assistant/assistant-project-label'
import { resolveSessionProjectPath } from '../src/renderer/src/pages/assistant/assistant-sessions-rail-utils'

const cwd = 'C:/Users/test/Documents/Implicit work folder'
const render = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(createElement(SettingsProvider, null, node))
const now = new Date().toISOString()
const thread = {
    id: 'projectless-thread', source: 'root', state: 'ready', cwd, model: null, lastError: null,
    messages: [{ id: 'reply', role: 'assistant', text: 'Saved answer', createdAt: now, updatedAt: now }],
    activities: [], pendingApprovals: [], pendingUserInputs: [], messageCount: 1, activityCount: 0,
    hasPendingApprovals: false, hasPendingUserInputs: false, latestTurn: null, createdAt: now, updatedAt: now
} as unknown as AssistantThread
const projectless = { id: 'projectless', title: 'A conversation', mode: 'work', projectPath: null, workingRoot: cwd, projectId: null, chatScope: null, threads: [thread], threadIds: [thread.id], activeThreadId: thread.id, archived: false, createdAt: now, updatedAt: now } as AssistantSession
const legacy = { ...projectless, id: 'explicit', title: 'An explicit project', projectPath: '/work/Legacy app', threads: [{ ...thread, id: 'explicit-thread', cwd: '/work/Legacy app' }], threadIds: ['explicit-thread'], activeThreadId: 'explicit-thread' }
const path = resolveSessionProjectPath(projectless)
assert.equal(path, '')
const label = resolveAssistantProjectLabel(null, projectless.projectId, path)
const greeting = render(createElement(AssistantNewChatGreeting, { prompt: getAssistantNewChatGreeting(label, 10, 0) }))
assert.match(greeting, /Good morning\. What are we working on\?/)
assert.doesNotMatch(greeting, /Implicit work folder|Documents|shaping in/)
const explicitGreeting = render(createElement(AssistantNewChatGreeting, { prompt: getAssistantNewChatGreeting(resolveAssistantProjectLabel(null, null, resolveSessionProjectPath(legacy)), 10, 0) }))
assert.match(explicitGreeting, /shaping in Legacy app/)
const chip = render(createElement(AssistantNewChatProjectChip, { projectId: null, projectPath: path, projectChoices: [], onSelectProject: () => {}, onCreateProject: () => {} }))
assert.match(chip, /Project context: No project/)
assert.doesNotMatch(chip, /Implicit work folder|Documents/)
const explicitChip = render(createElement(AssistantNewChatProjectChip, { projectId: null, projectPath: resolveSessionProjectPath(legacy), projectChoices: [], onSelectProject: () => {}, onCreateProject: () => {} }))
assert.match(explicitChip, /Project context: Legacy app/)
const sidebar = render(createElement(AssistantAgentInboxSidebar, { sessions: [projectless, legacy], activeSessionId: projectless.id, activeThreadId: thread.id, commandPending: false, pendingControlThreadIds: new Set(), projectIconOverrides: {}, headerActions: null, onCreateProjectChat: () => {}, onSelectSession: () => {}, onRename: () => {}, getSessionMenuItems: () => [], onOpenContextMenu: () => {} }))
assert.match(sidebar, /data-agent-inbox-layout-id="projectless"/)
assert.match(sidebar, />No project</)
assert.match(sidebar, />Legacy app</)
assert.doesNotMatch(sidebar, /Implicit work folder|Documents/)
const header = render(createElement(AssistantConversationHeader, { rightPanelOpen: false, rightPanelMode: 'none', selectedSessionTitle: 'A conversation', canonicalThreadId: null, activeThreadIsSubagent: false, activeThreadLabel: null, selectedProjectTooltip: 'No project', selectedProjectPath: path, latestProjectLabel: 'No project', projectDirectoryLocked: false, onCreateThread: () => {}, onRenameChat: () => {}, onCreateProjectChat: () => {}, onChooseProject: () => {}, onArchiveChat: () => {}, onDeleteChat: () => {}, onToggleRightSidebar: () => {} }))
assert.match(header, /Project context: No project/)
assert.doesNotMatch(header, /Implicit work folder|Documents/)
const setup = render(createElement(ProjectsStep, { selection: { projectsFolder: '' }, defaultFolder: 'D:/Redirected Documents/Zyra', onChange: () => {} }))
assert.match(setup, /Chat folder \(optional\)/)
assert.match(setup, /D:\/Redirected Documents\/Zyra/)
assert.match(setup, /No project/)
console.log('Rendered projectless greeting, project selector, Agent Inbox sidebar and optional setup: ok')
