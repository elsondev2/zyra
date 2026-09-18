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

@PreviewTest @Preview(widthDp=360, heightDp=720)
@Composable fun LandingInboxDarkReview() = LandingInboxReview(false)
@PreviewTest @Preview(widthDp=320, heightDp=760, fontScale=1.3f)
@Composable fun LandingInboxLightReview() = LandingInboxReview(true)

@Composable private fun LandingInboxReview(light: Boolean) {
    val completed = Chat("recent", "Review the updated mobile controls", "/projects/zyra", "ready", null, false, "pc", model = "openai-codex/gpt-6-astra", lastTurnState = "completed", lastTurnId = "finished-1", lastTurnCompletedAt = "2026-09-17T10:00:00Z")
    ZyraTheme(Appearance(mode = if (light) "light" else "dark")) {
        CompositionLocalProvider(LocalChatStatusNow provides java.time.Instant.parse("2026-09-17T10:00:00Z").toEpochMilli()) {
            Surface { Column(Modifier.fillMaxSize().padding(12.dp)) {
                Text("Working", Modifier.padding(10.dp), style = MaterialTheme.typography.labelMedium)
                ChatInboxCard(completed.copy(id="working", title="Polish the mobile file viewer", state="running", activeTurnStartedAt="2026-09-17T09:58:35Z"), "Studio PC", ProjectMark(slug="react",color="#61DAFB"), false, {}, {}, {}, settled=false, settle=null)
                ChatInboxCard(completed.copy(id="attention", attention="approval", title="Check the workspace permissions"), "Studio PC", ProjectMark(slug="electron",color="#47848F"), false, {}, {}, {}, settled=false, settle=null)
                Text("Recent", Modifier.padding(10.dp), style = MaterialTheme.typography.labelMedium)
                HorizontalDivider(Modifier.padding(horizontal=10.dp))
                ChatInboxCard(completed, "Studio PC", ProjectMark(slug="react",color="#61DAFB"), false, {}, {}, {}, settle={})
                Text("Settled", Modifier.padding(10.dp), style = MaterialTheme.typography.labelMedium)
                HorizontalDivider(Modifier.padding(horizontal=10.dp))
                ChatInboxCard(completed.copy(id="settled",title="Clean up the project settings"), "Studio PC", ProjectMark(slug="electron",color="#47848F"), false, {}, {}, {}, settled=true, settle={})
            } }
        }
    }
}
