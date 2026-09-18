package dev.zyra.mobile.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import dev.zyra.mobile.voice.VoiceState
import dev.zyra.mobile.voice.VoiceChoice

@Composable fun VoiceControls(state: VoiceState, mute: () -> Unit, speaker: () -> Unit, stop: () -> Unit, dismiss: () -> Unit, notifications: Boolean = true, choice: VoiceChoice = VoiceChoice.resolve(null), activity: dev.zyra.mobile.voice.VoiceActivity? = null) {
    if (!state.inCall && state.error == null) return
    Surface(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp), shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surfaceContainer, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        VoiceControlContent(state, mute, speaker, stop, dismiss, choice, activity)
    }
}

@Composable fun VoiceControlContent(state: VoiceState, mute: () -> Unit, speaker: () -> Unit, stop: () -> Unit, dismiss: () -> Unit,
    choice: VoiceChoice = VoiceChoice.resolve(null), activity: dev.zyra.mobile.voice.VoiceActivity? = null) {
        Column(Modifier.padding(horizontal = 8.dp, vertical = 4.dp)) {
            if (state.inCall) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    VoiceOrb(choice, state.phase == "active", Modifier.size(44.dp), activity)
                    Text(when (state.phase) { "connecting" -> "Connecting…"; "reconnecting" -> "Reconnecting…"; "stopping" -> "Ending…"; else -> if (state.muted) "Muted" else "Voice is live" }, style = MaterialTheme.typography.labelMedium, modifier = Modifier.weight(1f), maxLines = 2)
                    if (state.phase != "stopping") {
                        IconButton(mute, Modifier.size(44.dp)) { AppIcon(if (state.muted) R.drawable.ic_mic_off else R.drawable.ic_mic, if (state.muted) "Unmute microphone" else "Mute microphone", Modifier.size(18.dp)) }
                        IconButton(speaker, Modifier.size(44.dp)) { AppIcon(R.drawable.ic_volume_2, "Choose audio output", Modifier.size(18.dp)) }
                    }
                    IconButton(stop, Modifier.size(44.dp), enabled = state.phase != "stopping") { AppIcon(R.drawable.ic_phone_off, "End Voice", Modifier.size(18.dp)) }
                }
            }
            state.error?.let { error ->
                Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp))
                TextButton(dismiss) { Text("Dismiss") }
            }
        }
}
