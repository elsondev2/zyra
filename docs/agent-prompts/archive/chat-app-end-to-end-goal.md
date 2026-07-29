# Codex Goal: Make Zyra Chat Real End-to-End

> **Archived 2026-07-30.** This one-off execution brief was recovered from the repository root after the chat path was implemented. It is retained as historical agent context, not as current repository instructions. Several paths below predate the `desktop/` layout.

## One Job Only

Make the Zyra Electron UI work as a real chat app.

That means: I can start a chat, send a message, the agent responds, the conversation appears correctly in the chat view, and the chat appears correctly in the left chat rail. Project-backed chats must also work cleanly.

Do not redesign the app. Do not work on unrelated settings, memory, Git UI, theme polish, loading screens, titlebar polish, or broad refactors unless they directly block real chat behavior.

## Product Intent

Zyra is currently being simplified into a chat-first app.

The active product surface should be:

- chat composer
- chat timeline
- chat rail / thread management
- chat header actions
- project-backed chats, implemented cleanly but not visually heavy

The project system should be functional where chat needs it, but not brought back as a large explorer/dashboard.

## Required User Flow

This flow must work end-to-end:

1. Open Zyra.
2. Click New chat or land on an empty draft chat.
3. Type a prompt.
4. Send the prompt.
5. A real assistant run starts.
6. The user message appears in the timeline.
7. The assistant response streams or appears in the timeline.
8. The chat becomes a real saved chat, not just an invisible draft.
9. The chat appears in the left rail with a useful title and timestamp.
10. Selecting the chat from the rail restores the same conversation.
11. If the chat is attached to a project, the project association persists and is shown cleanly in the rail/grouping/header.

## Definition of Done

The work is done only when these are true:

- New empty draft chats stay hidden from the rail until there is real content.
- Sending the first prompt from a draft turns it into a real visible chat.
- The chat rail updates after the first message / assistant response without needing a restart.
- Selecting chats in the rail loads the correct session and thread.
- The timeline shows user messages, assistant messages, activity/loading states, and errors correctly.
- The agent can actually respond through the existing backend/service path.
- Chat state survives reload where the existing persistence layer supports it.
- Project-backed chats have a stable source of truth for project path/title.
- Project chats appear under Projects in the rail when appropriate.
- Non-project chats appear under Chats.
- The active chat header shows the right title/project/thread context.
- The chat header three-dot menu has the core actions needed for this kind of chat.
- Typecheck passes.

## Chat Header Three-Dot Menu Requirements

The chat header menu should include only useful chat actions for now:

- Rename chat
- New thread, if thread support is real and useful
- Archive chat
- Delete chat
- Copy chat/session id or path only if useful for debugging
- Project action if applicable:
  - attach/select project for this chat
  - reveal/change project only if the underlying flow already exists

Do not add decorative menu items. If an action is present, it should work.

## Project-Backed Chat Requirements

Projects should be implemented as chat context, not as a full dashboard.

A project-backed chat should have:

- a persisted project path or project identifier
- a readable project label
- clear rail grouping under Projects
- correct header display
- correct prompt/runtime context passed to the agent when sending
- no fake project rows
- no broken project buttons

If project selection is incomplete, implement the smallest clean version needed for chat:

- choose a folder/project path
- store it on the chat/session
- show it in rail/header
- include it when sending prompts

## Existing Files Likely Involved

Start by tracing the real flow through these files before editing:

- `apps/zyra-ui/src/renderer/src/pages/assistant/AssistantPage.tsx`
- `apps/zyra-ui/src/renderer/src/pages/assistant/AssistantConversationPane.tsx`
- `apps/zyra-ui/src/renderer/src/pages/assistant/AssistantConversationComposerPane.tsx`
- `apps/zyra-ui/src/renderer/src/pages/assistant/AssistantComposerView.tsx`
- `apps/zyra-ui/src/renderer/src/pages/assistant/useAssistantComposerController.ts`
- `apps/zyra-ui/src/renderer/src/pages/assistant/AssistantChatSessionsRail.tsx`
- `apps/zyra-ui/src/renderer/src/pages/assistant/AssistantConnectedSessionsRail.tsx`
- `apps/zyra-ui/src/renderer/src/pages/assistant/assistant-sessions-rail-utils.ts`
- `apps/zyra-ui/src/renderer/src/lib/assistant/assistant-store-core.ts`
- `apps/zyra-ui/src/renderer/src/lib/assistant/store.ts`
- `apps/zyra-ui/src/main/assistant/service.ts`

Trace source of truth first:

backend/service -> assistant store -> selected session/thread -> composer send -> timeline -> rail rows/header.

## Edge Cases That Must Be Considered

### Send and response failures

The UI must handle failure cleanly instead of looking stuck.

Cover these cases:

- assistant service disconnected before send
- send request rejected
- run starts but response fails
- stream disconnects mid-response
- backend returns an error payload
- model/runtime unavailable

Expected behavior:

- user message should not disappear silently
- failed assistant turn should show a clear error state in the timeline
- composer should become usable again after failure
- retry should be possible if an existing retry path exists
- if retry does not exist, expose a clean next action or leave a clear error message

### Stop / interrupt behavior

Stopping a generation must be real.

Expected behavior:

- stop button appears only when there is a running turn that can be interrupted
- stop calls the existing backend/store interrupt path
- timeline leaves a clear stopped/interrupted state
- composer unlocks after stop
- the next user message can be sent without corrupting the previous turn

### First-message title behavior

A draft chat becomes a real chat after the first useful user message.

Expected behavior:

- empty draft chats stay hidden from the rail
- first user message creates/saves real content
- rail title is derived from the first message when no explicit title exists
- manual rename overrides the generated title
- generated title should not keep changing after rename
- timestamp should update from real activity, not from fake UI state

### Message ordering and streaming

Messages must stay stable across live updates and reloads.

Expected behavior:

- user message appears before assistant response
- streaming partial text should update the same assistant message, not create duplicates
- final response should not duplicate the streamed response
- reload should preserve the same order
- activity/tool/status entries should appear near the correct turn
- switching chats during streaming should not write output into the wrong visible chat

### Draft cleanup

Drafts should feel invisible and reusable.

Expected behavior:

- do not create multiple empty New chat rows
- switching away from an unused draft should not pollute history
- pressing New chat repeatedly should reuse the active empty draft where appropriate
- once a draft has content, it becomes a normal chat and a new draft can be created later

### Delete and archive behavior

Chat management should leave the app in a sane state.

Expected behavior:

- deleting the active chat selects a sensible next chat or returns to a clean new-chat state
- archiving the active chat removes it from the normal rail immediately
- delete/archive should update store and rail without restart
- deleting should use the existing in-app confirmation pattern, not `window.confirm`
- failed delete/archive should show a clear error and not remove the chat visually unless it actually succeeded

### Thread behavior

Threads should only be exposed where they are real.

Expected behavior:

- if New thread works end-to-end, keep it in the header menu
- if New thread is incomplete or confusing, hide it until solid
- selecting a thread loads the correct messages
- subagent threads should not clutter the main rail as fake main chats
- subagent thread labels should be readable and stable
- main thread should remain understandable as the default conversation path

### Project path safety

Project-backed chats must not break if the local folder changes.

Expected behavior:

- missing/deleted project path should not crash the app
- header/rail should show a clean missing-project or unavailable-project state
- user should still be able to open/read the chat history
- changing or re-attaching a project should update the persisted session/project source of truth
- prompt sending should pass the correct current project context to the backend

### Keyboard basics

Do not regress basic chat shortcuts.

Expected behavior:

- Enter sends when appropriate
- Shift+Enter inserts a newline
- Ctrl/Cmd+N starts or reuses a new chat draft
- Ctrl/Cmd+K opens search/command palette
- Escape closes open menus/modals where appropriate

### Persistence boundary

Be explicit about what is real persistence and what is only local UI state.

Expected behavior:

- persisted chat/session/thread data should come from the existing service/store persistence path
- local-only layout preferences are okay for UI layout only
- do not use fake local fallback data to pretend chats are saved
- if something is intentionally temporary, document it in the handoff or code comment

## Execution Guidance

Codex may use subagents if available.

Good subagent splits:

- one subagent traces backend/service/session persistence
- one subagent traces renderer store and selection state
- one subagent traces composer send and timeline rendering
- one subagent traces rail/header/project grouping behavior

Subagents should report evidence from real files. Do not accept guesses. Merge their findings into one coherent fix.

Codex may also use computer-use / browser-use / UI automation if available.

Use it to verify real behavior, not to polish unrelated visuals:

- launch the Electron app if the environment supports it
- create a new chat
- send a real prompt
- watch the timeline update
- confirm the rail updates
- reload and reselect the chat
- create or attach a project chat and confirm project grouping/header context

If computer use is unavailable, do the closest practical manual/smoke verification and state what remains unproven.

## Do Not Do

- Do not redesign the composer.
- Do not redesign the sidebar.
- Do not add new decorative UI.
- Do not bring back the full old project explorer.
- Do not add settings screens.
- Do not hide broken behavior behind mock data.
- Do not make browser confirm dialogs; use the existing in-app modal pattern.
- Do not create duplicate empty chats.
- Do not make project rows appear from fake/demo data.

## Verification

Run:

```bash
bun run --cwd apps/zyra-ui typecheck
```

Also manually verify the chat flow:

- New chat -> send prompt -> user message appears.
- Assistant response appears.
- Rail shows the chat after real content exists.
- Reload -> chat can be selected again.
- Project chat -> project label/path persists and appears in rail/header.

If any of those fail, the task is not done.
