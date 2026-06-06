# Zyra Codex-Inspired UI Map

This is the target experience map for shaping the Zyra desktop app into a dense local-agent workspace inspired by Codex-style product flow, while keeping Zyra's own identity and public/private boundaries.

## Current Proof

- The Electron UI exists at `apps/zyra-ui`.
- The dev renderer starts at `http://localhost:5174/`.
- The active app shell is routed through `src/renderer/src/App.tsx`.
- The primary assistant surface is `src/renderer/src/pages/assistant/AssistantPage.tsx`.
- Core assistant pieces already exist: sessions rail, conversation timeline, bottom composer, right-side plan/details/diff panels, file preview modal, command palette, settings, project browser, and git/project detail surfaces.
- Computer Use could not inspect the Codex desktop app in this session because the native pipe was unavailable. The Computer Use workflow also forbids automating the Codex desktop app UI directly, so Codex-specific mapping should be treated as product inspiration rather than captured reference.

## Product Posture

Zyra should feel like a local workshop for coding with an agent:

- Compact, practical, and workbench-like.
- Main object is the active chat/thread, with project context close by.
- Composer is the primary control surface.
- Files, plans, diffs, sessions, and runtime details are contextual panels.
- Navigation is shallow: Assistant, Projects, Settings, quick command palette.

## Design Lane

- Matte black / graphite workbench, using the existing `codex` or `dp-code` theme as the base.
- Dense inspector layout with strong dividers, restrained radius, and small controls.
- Bottom composer as the anchor, not a decorative chat card.
- Left rail for sessions/projects; right rail for plan, details, and diffs.
- Minimal copy. Controls should explain through placement, icons, labels, and state.

## App Skeleton

```text
Title bar
  App switcher: Zyra / Projects
  Global command search
  Update/status icon
  Window controls

Main assistant workspace
  Left rail
    Work / Playground mode switch
    New chat / choose project actions
    Pinned chats
    Project groups
    Session rows
    Thread/subagent rows
    Rail footer actions

  Center workspace
    Conversation header
      sidebar toggle
      session title
      project/profile/runtime chips
      open-with menu
      plan button
      more menu

    Timeline
      empty centered composer state
      user messages
      assistant messages
      tool activity groups
      issue/activity rows
      context compaction markers
      proposed plan blocks
      working indicator
      scroll-to-bottom affordance

    Composer
      attachments
      file mentions
      multiline prompt
      model / effort / mode controls
      supervised/full access control
      voice input
      send / stop / queue / force controls

  Right contextual panel
    Plan panel
    Thread details panel
    Diff panel

Overlays
  Command palette
  File preview modal
  Attachment preview modal
  Pending user input panel
  Terminal access modal
  Confirm dialogs
  Toasts
```

## Core Flows

### First Launch

1. Open directly to Assistant.
2. If no active session exists, show a centered composer with one line: `What are we working on?`
3. Keep project attachment optional. A project can be chosen from the header or composer context.
4. Keep onboarding out of the main screen unless the user is blocked from continuing.

### Start Work Chat

1. User clicks new chat or types in the empty composer.
2. Zyra creates/selects a session.
3. If a project is attached, the header shows the project label and branch chip.
4. Timeline starts with the user's message, then tool/activity rows and assistant output.

### Mid-Run Interaction

1. Composer remains usable while the agent works.
2. Enter behavior maps to the configured busy mode.
3. Queue/force controls appear only while relevant.
4. Stop stays available in the composer action cluster.
5. Queued messages appear as a compact shelf above the composer.

### Plan Flow

1. Proposed plans render inside the timeline when created.
2. Plan button opens the right plan panel.
3. Plan panel shows current steps, progress, and open issues.
4. Implement action sends the approved plan into the active thread.

### File And Diff Flow

1. File paths in assistant output open a preview modal or project detail route.
2. Diffs open in the right diff panel first.
3. Full file preview opens only when the user requests deeper inspection.
4. The center timeline stays anchored while right panels change.

### Project Flow

1. Projects area is a secondary mode for browsing and managing local repos.
2. Project Details owns file tree, readme, git, scripts, and working changes.
3. Assistant chat can jump into Project Details through header actions.
4. Project Details can start an assistant session with that project attached.

### Settings Flow

1. Settings remain utility pages, not part of the main workspace.
2. Account/model/defaults sit under Assistant settings.
3. Appearance owns themes and density.
4. Logs and advanced behavior stay deeper in settings.

## Existing Code Refactor Targets

### Identity Cleanup

- Replace user-facing `DevScope` naming with `Zyra`.
- Replace `Sparkle` token names only if the churn is contained; user-facing text matters first.
- Replace public profile labels that are person-specific with public profile names: Default, Learner, Builder, Local.
- Keep local/private profile behavior available through `.zyra/profiles`.

### Layout Polish

- Make the `codex` theme the likely default for this direction.
- Reduce pill usage in header chips and composer controls.
- Tighten modal radii to match the workbench tone.
- Keep left rail rows line-based and compact.
- Keep the composer visually strong but not oversized.
- Make right panels feel like inspectors, with clear panel headers and stable widths.

### Navigation Simplification

- Top switcher should keep only Zyra and Projects unless a third destination earns its place.
- Settings should stay reachable from command palette or app/menu actions.
- Explorer route should remain gated if it is beta or external-launch only.
- Legacy `/home`, `/tasks`, `/terminals`, and `/skills` redirects are fine as compatibility routes.

### State Contract

- Source of truth: assistant store snapshot, selected session, active thread, runtime connection state, project path, and playground state.
- Rendered state must prove: selected session, selected thread, busy/idle, connection recovery, pending user input, queued messages, plan progress, and project attachment.
- Empty states should be short and action-bearing.
- Loading states should preserve layout dimensions.

## Implementation Order

1. Audit current Assistant surface visually from `http://localhost:5174/`.
2. Clean public identity leaks in visible UI copy.
3. Set Codex-inspired theme defaults and tighten tokens.
4. Polish Assistant shell: title bar, left rail, header, timeline, composer.
5. Polish right inspectors: plan, details, diff.
6. Verify empty, active, busy, queued, plan, pending input, diff, and preview states.
7. Run `npm run typecheck` in `apps/zyra-ui`.
8. Run root `npm run check` when the CLI/runtime contract is touched.

## Non-Negotiables

- Keep the command surface small.
- Keep private/local profile context out of public prompts, docs, and user-facing default copy.
- Do not turn the app into a generic project dashboard.
- Do not add decorative panels or fake tabs.
- Every visible control should perform a real action, open a real surface, or be removed.
