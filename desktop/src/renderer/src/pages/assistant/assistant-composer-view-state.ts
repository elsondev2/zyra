import type { Settings } from '@/lib/settings'
import type { AssistantComposerController } from './useAssistantComposerController'

type AssistantComposerViewStateInput = {
    capabilities: AssistantComposerController['capabilities']
    controller: AssistantComposerController
    settings: Pick<Settings, 'assistantTranscriptionEngine' | 'theme'>
}

export function deriveAssistantComposerViewState({
    capabilities,
    controller,
    settings
}: AssistantComposerViewStateInput) {
    const iconTheme: 'light' | 'dark' = settings.theme === 'light' ? 'light' : 'dark'
    const voiceBusy = controller.voiceInput.isRecording || controller.voiceInput.isTranscribing
    const composerStatusToneClass = capabilities.tone === 'warning'
        ? 'text-amber-200'
        : capabilities.tone === 'info'
            ? 'text-sky-200'
            : 'text-sparkle-text-secondary'
    const composerStatusDotClass = capabilities.tone === 'warning'
        ? 'bg-amber-300/80'
        : capabilities.tone === 'info'
            ? 'bg-sky-300/80'
            : 'bg-white/35'
    const transientStatus = controller.voiceInput.isRecording
        ? {
            label: settings.assistantTranscriptionEngine === 'vosk' ? 'Recording locally...' : 'Listening...',
            detail: 'Voice input is capturing a draft.',
            toneClass: 'text-rose-200',
            dotClass: 'animate-pulse bg-rose-400'
        }
        : controller.voiceInput.isTranscribing
            ? {
                label: 'Transcribing locally...',
                detail: 'The draft updates when transcription completes.',
                toneClass: 'text-sky-200',
                dotClass: 'animate-pulse bg-sky-300'
            }
            : controller.voiceInput.speechError
                ? {
                    label: controller.voiceInput.speechError,
                    detail: 'Open transcription settings if this keeps happening.',
                    toneClass: 'text-rose-200',
                    dotClass: 'bg-rose-300/80'
                }
                : controller.isThinking
                    ? {
                        label: controller.thinkingLabel,
                        detail: capabilities.detailLabel || 'The current turn is still running.',
                        toneClass: 'text-sky-200',
                        dotClass: 'animate-pulse bg-sky-300'
                    }
                    : controller.mentionLoading
                        ? {
                            label: 'Indexing project files...',
                            detail: 'Mention search results are still loading.',
                            toneClass: 'text-sparkle-text-secondary',
                            dotClass: 'animate-pulse bg-white/35'
                        }
                        : controller.branchesLoading
                            ? {
                                label: 'Loading branches...',
                                detail: 'Branch actions will appear when the repo metadata finishes loading.',
                                toneClass: 'text-sparkle-text-secondary',
                                dotClass: 'animate-pulse bg-white/35'
                            }
                            : null

    return {
        composerStatusDotClass,
        composerStatusToneClass,
        iconTheme,
        transientStatus,
        voiceBusy
    }
}
