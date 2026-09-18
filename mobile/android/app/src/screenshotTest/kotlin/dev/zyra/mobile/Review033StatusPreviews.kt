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
import org.json.JSONObject

private fun statusFixture(type: String, extra: JSONObject = JSONObject()): TimelineItem = TimelineStatus.apply(emptyList(), type,
    extra.put("type", type), extra.toString(), "event:" + type, "turn").single()

@PreviewTest @Preview(widthDp = 360, heightDp = 780)
@Composable fun TimelineStatusDarkReview() = TimelineStatusReview("dark")
@PreviewTest @Preview(widthDp = 320, heightDp = 820, fontScale = 1.3f)
@Composable fun TimelineStatusLightReview() = TimelineStatusReview("light")

@Composable private fun TimelineStatusReview(mode: String) {
    ZyraTheme(Appearance(mode = mode)) { Surface { Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Text("Chat activity", style = MaterialTheme.typography.titleLarge)
        Text("Before the response", style = MaterialTheme.typography.labelLarge)
        val compacting = statusFixture("compaction_start")
        TimelineWorkSummary(ChatRailRow.Work("compacting", listOf(compacting), true, false, emptyList()), {}, {}, {})
        Text("Connection recovery", style = MaterialTheme.typography.labelLarge)
        val reconnecting = statusFixture("auto_retry_start", JSONObject().put("recoveryKind", "network").put("attempt", 2).put("maxAttempts", 5))
        TimelineWorkSummary(ChatRailRow.Work("reconnecting", listOf(reconnecting), true, false, emptyList()), {}, {}, {})
        Text("After the response", style = MaterialTheme.typography.labelLarge)
        TimelineWorkSummary(ChatRailRow.Work("maintenance", listOf(compacting), false, true, emptyList()), {}, {}, {})
        Text("The change is ready. Your final response stays visible while context is compacted.", style = MaterialTheme.typography.bodyMedium)
        Text("Interrupted turn", style = MaterialTheme.typography.labelLarge)
        val failed = statusFixture("auto_retry_end", JSONObject().put("success", false).put("recoveryKind", "network"))
        TimelineWorkSummary(ChatRailRow.Work("failed", listOf(failed), false, false, emptyList()), {}, {}, {})
    } } }
}
