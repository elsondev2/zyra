package dev.zyra.mobile

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.android.tools.screenshot.PreviewTest
import dev.zyra.mobile.data.*
import dev.zyra.mobile.ui.*
import org.json.JSONObject

private fun review023Limits() = JSONObject("""{"fetchedAt":"2026-09-16T00:00:00Z","groups":[{"label":"Codex","windows":[{"remainingPercent":71,"durationMinutes":10080,"resetsAt":1790103600}]},{"label":"GPT-5.3-Codex-Spark","windows":[{"remainingPercent":97,"durationMinutes":300,"resetsAt":1789534800}]},{"label":"GPT-5.3-Codex-Spark","windows":[{"remainingPercent":63,"durationMinutes":10080,"resetsAt":1790103600}]}]}""")

@PreviewTest @Preview(name = "Grouped account limits", widthDp = 360, heightDp = 700)
@Composable fun GroupedLimits023Review() {
    ZyraTheme { Surface { Column(Modifier.fillMaxSize().padding(20.dp)) {
        UsageDestinationTitle("limits") {}
        AccountLimitsOverview(review023Limits(), false, null)
    } } }
}
@PreviewTest @Preview(name = "Saved limits and unknown quota", widthDp = 320, heightDp = 700, fontScale = 1.3f)
@Composable fun SavedLimits023Review() {
    ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize().padding(20.dp)) {
        UsageDestinationTitle("limits") {}
        AccountLimitsOverview(JSONObject("""{"groups":[{"label":"Codex","windows":[{"remainingPercent":null,"durationMinutes":300},{"remainingPercent":8,"durationMinutes":10080}]}]}"""), false, "Computer unavailable")
    } } }
}
@PreviewTest @Preview(name = "Grouped chat settings", widthDp = 360, heightDp = 800)
@Composable fun ChatSettings023Review() {
    ZyraTheme { Surface { Column(Modifier.fillMaxSize()) {
        Text("Chat settings", Modifier.padding(20.dp), style = MaterialTheme.typography.titleLarge)
        Column(Modifier.padding(horizontal = 20.dp)) {
            ThreadUsageSummary(JSONObject("""{"context":{"usedTokens":82900,"windowTokens":1100000},"usage":{"totalTokens":2800000,"responses":21,"reportedResponses":21,"reportedCostUsd":11.86}}"""))
        }
        Spacer(Modifier.height(20.dp))
        ChatSettingsContent(ChatConfiguration(model = "gpt-6-astra", thinking = "high", profile = "concise"),
            ChatPreferencesState(loaded = true, profile = "concise", memoryMode = "polluted"), true, {}, {}, {}, {}, { _, _ -> })
    } } }
}
