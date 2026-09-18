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

@PreviewTest @Preview(widthDp=360,heightDp=640)
@Composable fun ParityDarkReview() = ParityReview("dark")
@PreviewTest @Preview(widthDp=320,heightDp=760,fontScale=1.3f)
@Composable fun ParityLightReview() = ParityReview("light")
@Composable private fun ParityReview(mode: String) {
    ZyraTheme(Appearance(mode=mode)) { Surface { Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement=Arrangement.spacedBy(18.dp)) {
        Text("Chat", style=MaterialTheme.typography.titleLarge)
        val narration = TimelineItem("last", "assistant", "I’ll check the layout and make a targeted fix.", toolNames=listOf("begin_action_batch"))
        val tool = TimelineItem("tool:read", "tool", "read\nFile contents", "tool")
        val group = TimelineWork().rows(SessionView(items=listOf(tool,narration))).filterIsInstance<ChatRailRow.Work>().single()
        TimelineWorkSummary(group, {}, {}, {})
        TimelineMessage(narration) {}
        Text("Interrupted", style=MaterialTheme.typography.labelMedium, color=MaterialTheme.colorScheme.onSurfaceVariant)
        TimelineMessage(TimelineItem("user", "user", "Also keep the visualizations visible.")) {}
        HorizontalDivider()
        Text("Settled", style=MaterialTheme.typography.labelMedium, color=MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Older chats move here after three days.", style=MaterialTheme.typography.bodySmall)
    } } }
}
