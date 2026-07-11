# Zyra conversation timeline source cart

## Visual truth

Five local DevScope captures (not tracked) form the selected reference sequence. They show the same turn progressing from narration through grouped tools to a complete Markdown report.

## Code truth

- Code source: `src/renderer/src/pages/assistant/AssistantTimeline.tsx`
- Code source: `src/renderer/src/pages/assistant/AssistantTimelineRows.tsx`
- Code source: `src/renderer/src/pages/assistant/AssistantTimelineToolCalls.tsx`
- Code source: `src/renderer/src/pages/assistant/AssistantTimelineToolCallCard.tsx`
- Code source: `src/renderer/src/components/ui/MarkdownRenderer.tsx`
- Token source: `src/renderer/src/lib/settings-theme-catalog.ts` (`Vesper`)

## Preserved anatomy

- 768px conversation/composer axis.
- Public assistant narration remains in the timeline and separates consecutive tool batches.
- Tool cards stay compact, chronological, expandable, and labeled with command/file details plus time and duration.
- Internal model reasoning is excluded from the conversation.
- The final assistant lifecycle renders as full GitHub-flavored Markdown with the turn duration in its footer.
- Zyra keeps its own shell, sidebar, composer, branding, and Pi runtime.
