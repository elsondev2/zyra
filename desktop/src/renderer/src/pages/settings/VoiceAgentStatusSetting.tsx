import { useVoiceAgentStatusPreference } from '../assistant/useVoiceAgentStatusPreference'
import { writeVoiceAgentStatusPreference } from '../assistant/voice-agent-status-preference'
import { SettingsRow, SettingsSwitch } from './settings-layout'

export function VoiceAgentStatusSetting() {
    const enabled = useVoiceAgentStatusPreference()
    return <SettingsRow
        title="Agent status"
        description="Show primary-agent progress and completion rows in voice chats."
        control={<SettingsSwitch checked={enabled} onCheckedChange={writeVoiceAgentStatusPreference} label="Show voice agent status" />}
    />
}
