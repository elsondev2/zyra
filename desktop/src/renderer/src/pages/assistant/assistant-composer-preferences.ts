import type { AssistantReasoningEffort } from '@shared/assistant/contracts'

// Composer choices are persisted per canonical chat by assistant-composer-session-state.
// Defaults for new chats are owned by the typed Settings store.
export type AssistantComposerPreferenceEffort = AssistantReasoningEffort
