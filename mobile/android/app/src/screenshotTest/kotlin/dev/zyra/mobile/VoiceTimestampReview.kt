package dev.zyra.mobile

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.android.tools.screenshot.PreviewTest
import dev.zyra.mobile.data.*
import dev.zyra.mobile.ui.*
import dev.zyra.mobile.voice.*
import org.json.JSONObject

@PreviewTest @Preview(widthDp = 360, heightDp = 900)
@Composable fun VoiceTimeDarkReview() = VoiceTimeReview("dark")
@PreviewTest @Preview(widthDp = 320, heightDp = 1000, fontScale = 1.3f)
@Composable fun VoiceTimeLightReview() = VoiceTimeReview("light")

@Composable private fun VoiceTimeReview(mode: String) {
    val start = 1789630800000L
    ZyraTheme(Appearance(mode = mode, timestamps = true)) { Surface { Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Live", style = MaterialTheme.typography.titleMedium)
        VoiceTranscriptMessage(VoiceTranscript("user-live", "user", "Keep the time here while I talk.", startedAt = start))
        VoiceTranscriptMessage(VoiceTranscript("agent-live", "assistant", "The time is already visible as this response streams.", startedAt = start))
        HorizontalDivider()
        Text("Saved", style = MaterialTheme.typography.titleMedium)
        TimelineMessage(TimelineItem("message:saved-user", "user", "Keep the time here while I talk.", raw = JSONObject().put("timestamp", start + 60000).toString())) {}
        TimelineMessage(TimelineItem("message:saved-agent", "assistant", "The time is already visible as this response streams.", raw = JSONObject().put("timestamp", start + 60000).toString())) {}
        HorizontalDivider()
        Text("Speech start", style = MaterialTheme.typography.titleMedium)
        VoiceTranscriptMessage(VoiceTranscript("user-placeholder", "user", "Voice message", delivery = "listening", placeholder = true, startedAt = start))
    } } }
}
