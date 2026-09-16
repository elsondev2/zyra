package dev.zyra.mobile.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.zyra.mobile.R
import dev.zyra.mobile.data.AppPreferences
import dev.zyra.mobile.voice.*
import org.json.JSONObject

@Composable fun VoiceSettingsScreen(preferences: AppPreferences) {
    val selected by preferences.voice.collectAsStateWithLifecycle()
    val dictation by preferences.dictation.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val player = remember(context) { VoicePreviewPlayer(context.applicationContext) }
    val preview by player.state.collectAsStateWithLifecycle()
    val samples = remember(context) { runCatching { context.assets.open("voice-previews/content.json").bufferedReader().use { JSONObject(it.readText()) } }.getOrDefault(JSONObject()) }
    DisposableEffect(player, lifecycle) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_PAUSE) player.stop() }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer); player.stop() }
    }
    VoiceSettingsContent(selected, preview, samples.optJSONObject(selected)?.optString("topic").orEmpty(), samples.optJSONObject(selected)?.optString("text").orEmpty(),
        { player.stop(); preferences.selectVoice(it) }, { player.toggle(selected) }, dictation, preferences::enableDictation)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable fun VoiceSettingsContent(selected: String, preview: VoicePreviewState, topic: String, transcript: String, select: (String) -> Unit, toggle: () -> Unit, dictation: Boolean = false, setDictation: (Boolean) -> Unit = {}) {
    val choice = VoiceChoice.resolve(selected)
    var choosing by remember { mutableStateOf(false) }
    var showTranscript by remember { mutableStateOf(false) }
    var dictationDetails by remember { mutableStateOf(false) }
    val active = preview.phase != "idle"
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        item { Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Find your voice", style = MaterialTheme.typography.headlineSmall)
            Text("A familiar voice for your next conversation.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } }
        item {
            Surface(shape = MaterialTheme.shapes.extraLarge, color = MaterialTheme.colorScheme.surfaceContainer, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                Column(Modifier.fillMaxWidth().padding(vertical = 24.dp, horizontal = 12.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    VoiceOrb(choice, preview.phase == "playing", Modifier.size(176.dp))
                    TextButton(onClick = { choosing = true }) {
                        Text(choice.name, style = MaterialTheme.typography.titleLarge)
                        Spacer(Modifier.width(8.dp)); AppIcon(R.drawable.ic_chevron_down, "Choose voice", Modifier.size(18.dp))
                    }
                    ZyraButton(onClick = toggle) {
                        if (preview.phase == "loading") CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                        else AppIcon(if (active) R.drawable.ic_square else R.drawable.ic_play, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(8.dp)); Text(if (active) "Stop sample" else "Hear a sample")
                    }
                }
            }
        }
        item { ZyraSettingRow(R.drawable.ic_mic, "Dictation", "Speak to type", trailing = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton({ dictationDetails = true }) { AppIcon(R.drawable.ic_info, "About dictation", Modifier.size(18.dp)) }
                ZyraSwitch(dictation, setDictation)
            }
        }) }
        preview.error?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) } }
        item { Text("Saved for your next call on this phone. Samples play locally and work offline.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall) }
        if (transcript.isNotBlank()) item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                ZyraSettingRow(title = "Sample transcript", click = { showTranscript = !showTranscript }, trailing = { AppIcon(if (showTranscript) R.drawable.ic_chevron_down else R.drawable.ic_chevron_right) })
                if (showTranscript) {
                    Text(topic, style = MaterialTheme.typography.titleMedium)
                    Text(transcript, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
    if (dictationDetails) ZyraSheet("About dictation", { dictationDetails = false }) {
        Text("Dictation adds a microphone beside message controls. Speak, review the text, then send it when you are ready.", Modifier.padding(16.dp), style = MaterialTheme.typography.bodyMedium)
        Text("Audio is transcribed through the selected computer's ChatGPT connection. Voice mode remains a separate live conversation.", Modifier.padding(horizontal = 16.dp, vertical = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
    }
    if (choosing) ZyraSheet("Choose a voice", { choosing = false }) {
        VoiceChoice.all.forEach { voice ->
            ZyraSettingRow(title = voice.name, click = { select(voice.id); choosing = false }, trailing = {
                if (voice.id == choice.id) AppIcon(R.drawable.ic_check, "Selected")
                else Box(Modifier.size(8.dp).background(Color(voice.primary), CircleShape))
            })
        }
    }
}
