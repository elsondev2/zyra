import { useCallback } from 'react'
import type { AssistantApprovalDecision, AssistantPendingApproval } from '@shared/assistant/contracts'
import { cn } from '@/lib/utils'
import { AssistantPendingApprovalPanel } from './AssistantPendingApprovalPanel'
import { InstructorVoiceComposer } from './InstructorVoiceComposer'
import type { InstructorVoicePreferences } from './instructor-voice-preferences'
import { getInstructorVoiceVisualTheme } from './instructor-voice-visuals'
import type { useInstructorVoiceSession } from './useInstructorVoiceSession'

type VoiceSession = ReturnType<typeof useInstructorVoiceSession>

export function AssistantCanonicalVoiceDock({
    voice,
    preferences,
    pendingApprovals,
    approvalResponding,
    onRespondApproval,
    onRetry,
    onStop
}: {
    voice: VoiceSession
    preferences: InstructorVoicePreferences
    pendingApprovals: AssistantPendingApproval[]
    approvalResponding: boolean
    onRespondApproval: (requestId: string, decision: AssistantApprovalDecision) => Promise<void> | void
    onRetry: () => void
    onStop: () => void
}) {
    const visualTheme = getInstructorVoiceVisualTheme(preferences.voice)
    const sendMessage = useCallback(async (text: string) => voice.sendMessage({ text }), [voice.sendMessage])
    const statusMessage = voice.error || (
        voice.status === 'requesting-microphone'
            ? 'Allow microphone access to continue.'
            : voice.status === 'connecting'
                ? 'Connecting Zyra Voice…'
                : voice.status === 'stopping'
                    ? 'Ending Voice…'
                    : null
    )

    return (
        <div className="assistant-canonical-voice-dock pointer-events-none absolute inset-x-0 bottom-0 z-50 px-4 pb-4 pt-8">
            <div className="pointer-events-auto mx-auto w-full max-w-[760px]">
                {pendingApprovals.length > 0 ? (
                    <AssistantPendingApprovalPanel
                        pendingApprovals={pendingApprovals}
                        responding={approvalResponding}
                        onRespond={onRespondApproval}
                    />
                ) : (
                    <>
                        {statusMessage ? (
                            <p
                                role="status"
                                className={cn(
                                    'mb-1.5 truncate px-4 text-center text-[10px] text-sparkle-text-muted',
                                    voice.status === 'error' && 'text-rose-300'
                                )}
                            >
                                {statusMessage}
                            </p>
                        ) : null}
                        <InstructorVoiceComposer
                            status={voice.status}
                            microphoneMuted={voice.microphoneMuted}
                            accentColor={visualTheme.primary}
                            instructionsAvailable
                            allowImages={false}
                            onStart={onRetry}
                            onStop={onStop}
                            onToggleMicrophone={voice.toggleMicrophone}
                            onSend={sendMessage}
                        />
                    </>
                )}
            </div>
        </div>
    )
}
