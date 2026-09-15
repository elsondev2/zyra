package dev.zyra.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R

@Composable fun ChatPersonalization(state: ChatPreferencesState, connected: Boolean, profile: String,
    openProfiles: () -> Unit, setMemory: (Boolean) -> Unit, retry: () -> Unit) {
    val enabled = connected && state.loaded && !state.saving
    if (state.busy || state.saving) LinearProgressIndicator(Modifier.fillMaxWidth().padding(horizontal = 20.dp))
    ZyraSettingRow(R.drawable.ic_message_square, "Speaking style", state.profile.ifBlank { profile }.replaceFirstChar { it.uppercase() }.ifBlank { "From your PC" },
        click = if (enabled) openProfiles else null)
    if (state.loaded) ZyraSettingRow(title = "Learn from this chat",
        subtitle = if (state.memoryMode == "polluted") "Excluded because this chat contains external context. Turn on to include it again."
            else "Let Zyra save useful learnings from this chat on your PC.",
        trailing = { ZyraSwitch(state.memoryMode == "enabled", setMemory, enabled = enabled && state.memoryMode.isNotBlank()) })
    if (state.error != null) {
        Text(state.error, Modifier.padding(horizontal = 20.dp, vertical = 8.dp), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        TextButton(onClick = retry, enabled = connected && !state.busy && !state.saving, modifier = Modifier.padding(horizontal = 12.dp)) { Text("Reload preferences") }
    }
    if (!connected) Text("Reconnect to this PC to change chat preferences.", Modifier.padding(horizontal = 20.dp, vertical = 8.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable fun SpeakingStyles(state: ChatPreferencesState, enabled: Boolean, choose: (String) -> Unit) {
    Text("Applies to this chat and sets the default style for new chats in this project.", Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    if (state.saving) LinearProgressIndicator(Modifier.fillMaxWidth().padding(horizontal = 20.dp))
    state.error?.let { Text(it, Modifier.padding(20.dp), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    state.profiles.forEach { profile ->
        ZyraSettingRow(title = profile.name.replaceFirstChar { it.uppercase() }, subtitle = profile.description,
            click = if (enabled && !state.saving) ({ choose(profile.name) }) else null,
            trailing = { ZyraSelectionMark(profile.name == state.profile) })
    }
}
