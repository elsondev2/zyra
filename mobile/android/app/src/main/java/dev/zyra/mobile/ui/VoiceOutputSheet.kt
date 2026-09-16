package dev.zyra.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import dev.zyra.mobile.voice.VoiceAudioOutputs
import dev.zyra.mobile.voice.VoiceOutputKind

@Composable fun VoiceOutputSheet(outputs: VoiceAudioOutputs, select: (Int) -> Unit, close: () -> Unit) {
    ZyraSheet("Audio output", close) { VoiceOutputRows(outputs, select) }
}
@Composable fun ColumnScope.VoiceOutputRows(outputs: VoiceAudioOutputs, select: (Int) -> Unit) {
    Text("Choose where you hear Zyra. Connected headphones appear here automatically.", style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
    if (outputs.available.isEmpty()) Text("Waiting for Android audio…", modifier = Modifier.padding(20.dp))
    outputs.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) }
    outputs.available.forEach { output ->
        ZyraSettingRow(when (output.kind) { VoiceOutputKind.Speaker -> R.drawable.ic_volume_2; VoiceOutputKind.Phone -> R.drawable.ic_smartphone; VoiceOutputKind.Headphones -> R.drawable.ic_headphones }, output.name,
            when (output.id) { outputs.pending -> "Connecting…"; outputs.selected -> "Playing here"; else -> null }, click = { select(output.id) },
            trailing = { if (outputs.pending == output.id) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else if (outputs.selected == output.id) AppIcon(R.drawable.ic_check, "Selected") })
    }
}
