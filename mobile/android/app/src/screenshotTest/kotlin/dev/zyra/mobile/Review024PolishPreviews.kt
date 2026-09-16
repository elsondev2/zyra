package dev.zyra.mobile

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.android.tools.screenshot.PreviewTest
import dev.zyra.mobile.data.*
import dev.zyra.mobile.ui.*
import org.json.JSONObject

@Composable private fun Sheet024(title: String, body: @Composable () -> Unit) {
    ZyraTheme(Appearance(mode = "dark")) { Surface { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
        ZyraSheetContent(title, {}) {
            Box(Modifier.fillMaxWidth().onSizeChanged { check(it.height > 40) { "Sheet body collapsed: $title" } }) { body() }
        }
    } } }
}
@PreviewTest @Preview(widthDp=320, heightDp=640, fontScale=1.3f)
@Composable fun SpeakingSheet024Review() = Sheet024("Speaking style") {
    SpeakingStyleOptions(ChatPreferencesState(loaded=true, profile="concise", profiles=listOf(SpeakingStyle("concise", "Keep responses short and direct"), SpeakingStyle("detailed", "Explain with context and examples"))), true, {})
}
@PreviewTest @Preview(widthDp=320, heightDp=640)
@Composable fun EmptySpeakingSheet024Review() = Sheet024("Speaking style") { SpeakingStyleOptions(ChatPreferencesState(loaded=true), true, {}) }
@PreviewTest @Preview(widthDp=320, heightDp=640, fontScale=1.3f)
@Composable fun AdvancedSheet024Review() = Sheet024("Advanced") { AdvancedChatControls(ChatConfiguration(runtimeMode="auto-review", webSearch=true), true, { _, _ -> }) }
@PreviewTest @Preview(widthDp=320, heightDp=640, fontScale=1.3f)
@Composable fun ActivitySheet024Review() = Sheet024("Activity details") { ThreadActivityDetails(JSONObject("""{"context":{"usedTokens":94000,"windowTokens":1050000},"usage":{"inputTokens":320000,"cachedInputTokens":1200000,"outputTokens":18000}}""")) }
@PreviewTest @Preview(widthDp=320, heightDp=700, fontScale=1.3f)
@Composable fun AboutLight024Review() { ZyraTheme(Appearance(mode="light")) { Surface { AboutScreen({}) } } }
@PreviewTest @Preview(widthDp=320, heightDp=700, fontScale=1.3f)
@Composable fun AboutDark024Review() { ZyraTheme(Appearance(mode="dark")) { Surface { AboutScreen({}) } } }

@PreviewTest @Preview(widthDp=360, heightDp=800, fontScale=1.1f)
@Composable fun DenseUsage024Review() {
    val rows = org.json.JSONArray("""[{"harness":"zyra","model":"gpt-5.6-sol","responses":210,"totalTokens":250000000,"reportedResponses":210,"reportedCostUsd":280.50},{"harness":"codex","model":"gpt-6-astra","responses":40,"totalTokens":140000000,"unpricedResponses":40},{"harness":"zyra","model":"gpt-6-astra","responses":90,"totalTokens":90000000,"reportedResponses":90,"reportedCostUsd":140.00}]""")
    val daily = org.json.JSONArray()
    repeat(30) { day -> daily.put(JSONObject().put("date", java.time.LocalDate.of(2026,8,17).plusDays(day.toLong()).toString()).put("responses",3).put("totalTokens", (day % 7 + 1) * 11000000L)) }
    val data=JSONObject().put("partial",true).put("daily",daily).put("models",rows).put("totals",JSONObject("""{"responses":340,"totalTokens":480000000,"reportedResponses":300,"unpricedResponses":40,"reportedCostUsd":420.50}"""))
    ZyraTheme(Appearance(mode="dark")) { Surface { Column(Modifier.fillMaxSize().padding(20.dp)) {
        Text("Usage", style=MaterialTheme.typography.titleLarge)
        UsageContent(data)
    } } }
}
