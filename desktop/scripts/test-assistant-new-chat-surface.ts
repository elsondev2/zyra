import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deriveAssistantConversationSurfaceMode, isAssistantComposerTurnActive } from '../src/renderer/src/pages/assistant/assistant-conversation-surface-mode'
import { clearMentionIndex, getOrCreateMentionIndex } from '../src/renderer/src/pages/assistant/assistant-composer-mentions'
import { resolveAssistantProjectLabel } from '../src/renderer/src/pages/assistant/assistant-project-label'
import { buildAssistantProjectChoices, getAssistantProjectIconSourcePath } from '../src/renderer/src/pages/assistant/assistant-project-choices'
import { getNewChatProjectUnavailableReason, getOptimisticProjectWorkingRoot, runLatestProjectSave } from '../src/renderer/src/pages/assistant/assistant-new-chat-project-selection'
import { runAssistantStoreAction } from '../src/renderer/src/lib/assistant/assistant-store-action-runner'
import type { AssistantProject } from '../src/shared/assistant/contracts'

const managedId = 'project_0123456789abcdef0123456789abcdef'
assert.equal(isAssistantComposerTurnActive({ newChatHandoffActive: false, selectedSessionIsDraft: true, isThreadWorking: true, optimisticPromptSending: false, optimisticPromptAwaitingUserMessage: false }), false, 'provider or setup activity without a turn cannot make a draft chat look busy')
assert.equal(isAssistantComposerTurnActive({ newChatHandoffActive: false, selectedSessionIsDraft: true, isThreadWorking: false, optimisticPromptSending: true, optimisticPromptAwaitingUserMessage: false }), true, 'sending the first prompt shows work immediately')
assert.equal(isAssistantComposerTurnActive({ newChatHandoffActive: false, selectedSessionIsDraft: true, isThreadWorking: false, optimisticPromptSending: false, optimisticPromptAwaitingUserMessage: true }), true, 'work remains visible while the first user message enters the canonical chat')
assert.equal(isAssistantComposerTurnActive({ newChatHandoffActive: false, selectedSessionIsDraft: false, isThreadWorking: true, optimisticPromptSending: false, optimisticPromptAwaitingUserMessage: false }), true, 'an established running turn keeps the working state')
assert.equal(isAssistantComposerTurnActive({ newChatHandoffActive: true, selectedSessionIsDraft: false, isThreadWorking: true, optimisticPromptSending: true, optimisticPromptAwaitingUserMessage: true }), false, 'new chat handoff cannot display the previous chat turn')
assert.equal(resolveAssistantProjectLabel('Website', managedId, `C:/managed/${managedId}`), 'Website')
assert.equal(resolveAssistantProjectLabel(null, managedId, `C:/managed/${managedId}`), '', 'loading a catalog must not flash a managed identifier')
assert.equal(resolveAssistantProjectLabel(null, null, `C:/managed/${managedId}`), '', 'legacy managed paths must not leak identifiers either')
assert.equal(resolveAssistantProjectLabel(null, null, 'C:/projects/legacy-app'), 'legacy-app')
assert.equal(resolveAssistantProjectLabel(null, null, null), '')

function makeProject(id: string, name: string, folders: string[] = []): AssistantProject {
    return { id, name, homePath: `C:/fixture/homes/${id}`, archived: false, revision: 1, createdAt: '', updatedAt: '', folders: folders.map((path, index) => ({ associationId: `${id}-${index}`, folderId: `folder-${index}`, projectId: id, path, label: `Folder ${index}`, access: 'read-write', available: true, createdAt: '', updatedAt: '' })) }
}
const website = makeProject('website', 'Website', ['C:/fixture/root', 'C:/fixture/backend', 'C:/fixture/docs'])
const notes = makeProject('notes', 'Notes')
const separateSameName = makeProject('website-other', 'Website', ['C:/fixture/other'])
const archived = { ...makeProject('archive', 'Archive'), archived: true }
const projects = [website, notes, separateSameName, archived]
const projectAvailability = { hasSession: true, isDraft: true, projectLocked: false, commandPending: false, catalogLoading: false }
assert.equal(getNewChatProjectUnavailableReason(projectAvailability), null)
assert.match(getNewChatProjectUnavailableReason({ ...projectAvailability, projectLocked: true }) || '', /active chat work/u)
assert.match(getNewChatProjectUnavailableReason({ ...projectAvailability, catalogLoading: true }) || '', /still loading/u)
assert.equal(getOptimisticProjectWorkingRoot(website), website.folders[0].path)
assert.equal(getOptimisticProjectWorkingRoot({ ...website, folders: [{ ...website.folders[0], available: false }, { ...website.folders[1], access: 'read-only' }] }), website.homePath)
let latestProjectRequest = { id: 'A' }
let finishFirstSave!: (result: { success: false; error: string }) => void
const savedProjectRequests: string[] = []
const settledProjectRequests: string[] = []
const rapidSwitch = runLatestProjectSave({
    getLatest: () => latestProjectRequest,
    save: (selection) => {
        savedProjectRequests.push(selection.id)
        return selection.id === 'A'
            ? new Promise<{ success: false; error: string }>((resolve) => { finishFirstSave = resolve })
            : Promise.resolve({ success: true as const })
    },
    settle: (selection) => { settledProjectRequests.push(selection.id) }
})
latestProjectRequest = { id: 'B' }
latestProjectRequest = { id: 'C' }
finishFirstSave({ success: false, error: 'The superseded save failed.' })
await rapidSwitch
assert.deepEqual(savedProjectRequests, ['A', 'C'], 'rapid Project choices save only the in-flight and latest requests')
assert.deepEqual(settledProjectRequests, ['C'], 'an outdated failure cannot roll back the latest Project choice')
let finishProjectChange!: (result: { success: true }) => void
const pendingChanges: Array<Record<string, unknown>> = []
const projectChange = runAssistantStoreAction(
    (update) => { if (typeof update === 'object') pendingChanges.push(update) },
    () => new Promise<{ success: true }>((resolve) => { finishProjectChange = resolve }),
    { markCommandPending: false, reportError: false }
)
assert.deepEqual(pendingChanges, [{ error: null }], 'project scope save does not raise the global command-pending flag')
finishProjectChange({ success: true })
assert.deepEqual(await projectChange, { success: true })
assert.deepEqual(pendingChanges, [{ error: null }], 'finishing a project scope save cannot clear another command-pending action')
assert.deepEqual(await runAssistantStoreAction(
    (update) => { if (typeof update === 'object') pendingChanges.push(update) },
    async () => ({ success: false as const, error: 'Superseded save failed.' }),
    { markCommandPending: false, reportError: false }
), { success: false, error: 'Superseded save failed.' })
assert.deepEqual(pendingChanges, [{ error: null }, { error: null }], 'a superseded Project failure stays local to the latest-selection queue')
const unchangedProjects = JSON.stringify(projects)
assert.deepEqual(buildAssistantProjectChoices(projects), [
    { projectId: website.id, label: website.name, iconSourcePath: website.folders[0].path },
    { projectId: notes.id, label: notes.name, iconSourcePath: notes.homePath },
    { projectId: separateSameName.id, label: separateSameName.name, iconSourcePath: separateSameName.folders[0].path }
], 'the picker has one entry per active Project, not per home or associated folder')
assert.equal(JSON.stringify(projects), unchangedProjects, 'presentation cannot mutate Project folders or scope')
assert.equal(getAssistantProjectIconSourcePath(null), null)
assert.equal(getAssistantProjectIconSourcePath({ ...website, folders: [{ ...website.folders[0], available: false }, ...website.folders.slice(1)] }), website.folders[0].path, 'availability cannot silently substitute a different folder identity for the icon')

assert.equal(
    deriveAssistantConversationSurfaceMode({
        newChatHandoffActive: false,
        selectedSessionUsesNewChatSurface: true,
        showChatOnboardingOverlay: false,
        selectedThreadHasHistoricalContent: true,
        timelineMessageCount: 0,
        activityCount: 4,
        proposedPlanCount: 0,
        isThreadWorking: false,
        connectionBelongsToSelectedChat: false,
        isLoadingSelectedChat: false,
        pendingApprovalCount: 0,
        pendingInputCount: 0,
        hasPendingLabRequest: false
    }),
    'centered-composer',
    'runtime-only connection activities must not turn a new empty session into a blank conversation shell'
)

assert.equal(
    deriveAssistantConversationSurfaceMode({
        newChatHandoffActive: false,
        selectedSessionUsesNewChatSurface: false,
        showChatOnboardingOverlay: false,
        selectedThreadHasHistoricalContent: true,
        timelineMessageCount: 1,
        activityCount: 0,
        proposedPlanCount: 0,
        isThreadWorking: false,
        connectionBelongsToSelectedChat: false,
        isLoadingSelectedChat: false,
        pendingApprovalCount: 0,
        pendingInputCount: 0,
        hasPendingLabRequest: false
    }),
    'conversation',
    'real persisted chat history must keep the timeline and bottom composer'
)

const paneSource = readFileSync(resolve(import.meta.dir, '../src/renderer/src/pages/assistant/AssistantConversationPane.tsx'), 'utf8')
const composerPaneSource = readFileSync(resolve(import.meta.dir, '../src/renderer/src/pages/assistant/AssistantConversationComposerPane.tsx'), 'utf8')
const composerSectionsSource = readFileSync(resolve(import.meta.dir, '../src/renderer/src/pages/assistant/AssistantComposerSections.tsx'), 'utf8')
const placementMotionSource = readFileSync(resolve(import.meta.dir, '../src/renderer/src/pages/assistant/useAssistantComposerPlacementMotion.ts'), 'utf8')
const projectChipSource = readFileSync(resolve(import.meta.dir, '../src/renderer/src/pages/assistant/AssistantNewChatProjectChip.tsx'), 'utf8')
const projectCatalogSource = readFileSync(resolve(import.meta.dir, '../src/renderer/src/pages/assistant/useAssistantProjectCatalog.ts'), 'utf8')
const composerSource = readFileSync(resolve(import.meta.dir, '../src/renderer/src/pages/assistant/AssistantComposerView.tsx'), 'utf8')
assert.match(paneSource, /\{!composerIsCentered \? \([\s\S]{0,160}<AssistantConversationTimelinePane/u, 'the hidden timeline must leave layout so it cannot push the centered composer downward')
assert.match(paneSource, /newChatPrompt=\{emptyComposerPrompt\}/u, 'the centered New Chat surface must receive its contextual greeting')
assert.match(paneSource, /thinking=\{composerTurnActive\}/u, 'setup commands must not drive the composer working indicator')
assert.match(composerSectionsSource, /modelsLoading \? 'Loading models\.\.\.'/u, 'model catalog refresh has its own status instead of appearing as chat work')
assert.match(composerPaneSource, /useAssistantComposerPlacementMotion\(props\.paneRef, placement\)/u, 'the composer should animate between centered and docked geometry')
assert.match(composerPaneSource, /\{placement === 'center' \? \(/u, 'the greeting leaves layout before the bottom composer inset is measured')
assert.doesNotMatch(composerPaneSource, /transition-\[grid-template-rows,margin,opacity,transform\]/u, 'the greeting must not feed a height animation back into the virtual timeline')
assert.match(placementMotionSource, /element\.animate\(\[/u, 'placement motion should use FLIP geometry rather than an abrupt layout switch')
assert.match(placementMotionSource, /translate: `\$\{deltaX\}px \$\{deltaY\}px`[\s\S]{0,100}scale: `\$\{scaleX\} 1`/u, 'FLIP motion must use independent translate and scale properties so centered resting transforms remain intact')
assert.match(placementMotionSource, /prefers-reduced-motion: reduce/u, 'composer placement motion should respect reduced-motion preferences')
assert.match(projectChipSource, /data-assistant-new-chat-project-chip="true"/u, 'New Chat should expose its project context on the composer seam')
assert.match(projectChipSource, /No project/u, 'detached New Chat context must be explicit')
assert.match(projectChipSource, /New project…/u, 'the project context menu opens reviewed Project creation directly')
assert.doesNotMatch(projectChipSource, /Detected folders|Choose folder…|rootLabel|Project home/u, 'the compact picker exposes Projects only, with no folder rows or subtitles')
assert.match(projectChipSource, /key=\{project\.projectId\}/u)
assert.match(projectChipSource, /projectPath=\{project\.iconSourcePath\}/u, 'Project rows use the first-folder icon source')
assert.match(projectChipSource, /projectPath=\{iconSourcePath\}/u, 'the collapsed chip uses Project identity, not the current Working root')
assert.match(projectChipSource, /aria-checked=\{project\.projectId === props\.projectId\}/u, 'selection follows Project identity even with a different Working root')
assert.match(projectChipSource, /props\.onSelectProject\(projectId\)/u, 'a picker selection sends only a Project ID')
assert.match(projectChipSource, /props\.onUnavailable\?\.\(props\.unavailableReason\)/u, 'clicking an unavailable Project chip reports the reason')
assert.doesNotMatch(projectChipSource, /workingRoot|project\.path/u)
assert.match(paneSource, /buildAssistantProjectChoices\(projectCatalogState\.catalog\.projects\)/u, 'production and fixtures use the same catalog projection')
assert.match(paneSource, /setSessionProjectResult\(sessionId, \{ projectId: selection\.projectId \}\)/u, 'Project selection retains the backend Working-root policy')
assert.match(paneSource, /pendingProjectSelectionsRef\.current\.set\(session\.id, selection\)/u, 'Project selection previews the pending Project immediately')
assert.match(paneSource, /await runLatestProjectSave\(/u, 'New Chat uses the latest-selection save sequence')
assert.match(paneSource, /pendingProjectSelectionsRef\.current\.delete\(sessionId\)[\s\S]*Could not update Project/u, 'failed final Project saves restore the canonical selection and show a toast')
assert.match(paneSource, /resolveAssistantProjectLabel\(displayProjectName, displayProjectId, displayProjectPath\)/u, 'the greeting uses the durable Project name instead of its managed directory ID')
assert.match(projectCatalogSource, /assistant\.listProjects\(\)/u, 'New Chat Project choices come from the durable catalog even when no Chat references a folder')
assert.match(paneSource, /handleCreateNewChatProject[\s\S]*await requestProjectCreation\(\)/u, 'the new-project action starts with the setup modal, not an OS folder picker')
assert.match(composerSource, /surface-floating[\s\S]{0,260}shadow-\[0_22px_68px/u, 'the centered composer should use the raised floating-surface edge language')

const originalWindow = (globalThis as { window?: unknown }).window
let resolveFileTree: ((value: {
    success: true
    tree: Array<{ name: string; path: string; type: 'file'; isHidden: false; modifiedAt: number }>
}) => void) | null = null
let fileTreeRequests = 0
;(globalThis as any).window = {
    devscope: {
        getFileTree: async () => {
            fileTreeRequests += 1
            return new Promise((resolve) => { resolveFileTree = resolve })
        }
    }
}
try {
    clearMentionIndex()
    const firstIndex = getOrCreateMentionIndex('C:/fixture-project')
    const duplicateIndex = getOrCreateMentionIndex('C:/fixture-project')
    assert.equal(fileTreeRequests, 1, 'simultaneous composer mounts must share one in-flight mention-index scan')
    resolveFileTree?.({
        success: true,
        tree: [{
            name: 'index.ts',
            path: 'C:/fixture-project/index.ts',
            type: 'file',
            isHidden: false,
            modifiedAt: 1234
        }]
    })
    const [firstEntries, duplicateEntries] = await Promise.all([firstIndex, duplicateIndex])
    assert.equal(firstEntries, duplicateEntries, 'deduplicated mention scans must reuse the same indexed entries')
    assert.equal(firstEntries[0]?.modifiedAt, 1234, 'mention entries retain file-tree timestamps without opening file contents')
} finally {
    clearMentionIndex()
    if (originalWindow === undefined) delete (globalThis as any).window
    else (globalThis as any).window = originalWindow
}

const projectDataSource = readFileSync(resolve(import.meta.dir, '../src/renderer/src/pages/assistant/useAssistantComposerProjectData.ts'), 'utf8')
const mentionSource = readFileSync(resolve(import.meta.dir, '../src/renderer/src/pages/assistant/assistant-composer-mentions.ts'), 'utf8')
const fileTreeSource = readFileSync(resolve(import.meta.dir, '../src/main/ipc/handlers/file-tree-handlers.ts'), 'utf8')
assert.match(projectDataSource, /mentionActive/u, 'composer file indexing waits for explicit mention intent')
assert.doesNotMatch(projectDataSource, /readFileContent/u, 'mention recency must use file metadata rather than reading candidate contents')
assert.match(mentionSource, /mentionIndexRequestCache/u, 'mention indexing deduplicates in-flight scans')
assert.match(fileTreeSource, /modifiedAt: stats\.mtimeMs/u, 'file-tree metadata carries modification time from the existing stat call')

console.log('Assistant new-chat surface: ok')
