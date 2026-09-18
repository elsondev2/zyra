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

private fun reviewAction(id: String, name: String, pending: Boolean) = WorkActions.project(TimelineItem(id, "tool", "$name\nDone", "tool", pending = pending,
    raw = """{"toolName":"$name","actionBatchIntent":"Verify the workspace changes"}"""))

@PreviewTest @Preview(widthDp = 320, heightDp = 720, fontScale = 1.1f)
@Composable fun ActiveWorkReview() {
    ZyraTheme(Appearance(mode = "dark")) { Surface { Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("Working", style = MaterialTheme.typography.titleLarge)
        val actions = listOf(reviewAction("tool:one", "bash", false), reviewAction("tool:two", "read", true))
        val narration = TimelineItem("narration", "assistant", "The first check passed. I am checking the next file.")
        TimelineWorkSummary(ChatRailRow.Work("active", actions.map { it.item } + narration, true, false, actions), {})
        Text("Finished", style = MaterialTheme.typography.titleMedium)
        TimelineWorkSummary(ChatRailRow.Work("done", actions.map { it.item }, false, true, actions.map { it.copy(item = it.item.copy(pending = false)) }), {})
        Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surfaceContainer) { Column {
            BusySendModeItem(false) {}
            BusySendModeItem(true) {}
        } }
    } } }
}

@PreviewTest @Preview(widthDp = 320, heightDp = 640, fontScale = 1.1f)
@Composable fun CapturedEditReview() {
    ZyraTheme(Appearance(mode = "dark")) { Surface { Column(Modifier.fillMaxSize()) {
        Text("Editing TimelineWork.kt", Modifier.padding(20.dp), style = MaterialTheme.typography.titleMedium)
        val path = "C:/Users/example/Projects/zyra/mobile/android/app/src/main/java/dev/zyra/mobile/data/TimelineWork.kt"
        val action = WorkActions.project(TimelineItem("edit", "tool", "edit\nSuccessfully replaced 1 block.", "tool"), "edit" to org.json.JSONObject().put("path", path))
        CapturedEditContent(action, CapturedEdit("--- a/TimelineWork.kt\n+++ b/TimelineWork.kt\n@@ -1,2 +1,2 @@\n-val final = replyAfterTool\n+val final = !running\n keepNarrationVisible()", true))
    } } }
}
