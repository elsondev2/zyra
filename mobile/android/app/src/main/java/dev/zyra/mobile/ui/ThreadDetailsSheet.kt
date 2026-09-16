package dev.zyra.mobile.ui
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.zyra.mobile.R
import dev.zyra.mobile.data.ConnectionState
import kotlinx.coroutines.isActive
import org.json.JSONObject
import java.text.NumberFormat
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
/** Chat activity, preferences and maintenance share a compact, grouped destination. */
@Composable fun ChatSettingsScreen(vm: MobileSession, models: () -> Unit) {
    val state by vm.state.collectAsStateWithLifecycle()
    val preferences by vm.chatPreferences.state.collectAsStateWithLifecycle()
    var details by remember(state.machine?.id, state.session.id) { mutableStateOf<JSONObject?>(null) }
    var error by remember(state.machine?.id, state.session.id) { mutableStateOf<String?>(null) }
    var revision by remember { mutableIntStateOf(0) }
    var loading by remember { mutableStateOf(true) }
    val connected = state.connection == ConnectionState.Connected && !state.busy
    LaunchedEffect(state.machine?.id, state.session.id, connected) { if (connected) vm.loadChatPreferences() }
    DisposableEffect(vm) { onDispose { vm.chatPreferences.close() } }
    LaunchedEffect(state.machine?.id, state.session.id, state.connection, revision) {
        if (state.connection != ConnectionState.Connected) { loading = state.connection == ConnectionState.Connecting || state.connection == ConnectionState.Reconnecting; error = null; return@LaunchedEffect }
        loading = true; error = null
        try { details = vm.sessionDetails() }
        catch (failure: Exception) {
            currentCoroutineContext().ensureActive()
            if (failure is kotlinx.coroutines.CancellationException && failure !is kotlinx.coroutines.TimeoutCancellationException) throw failure
            error = if (failure is kotlinx.coroutines.TimeoutCancellationException) "Chat statistics took too long to load. Try refreshing." else failure.message ?: "Chat statistics are unavailable."
        } finally { if (kotlinx.coroutines.currentCoroutineContext().isActive) loading = false }
    }
    val generating = "${state.machine?.id}:${state.session.id}" in state.regeneratingTitles
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
        Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Activity", Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
                IconButton({ revision++ }, enabled = connected && !loading) {
                    if (loading) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                    else AppIcon(R.drawable.ic_refresh_cw, "Refresh chat statistics")
                }
            }
            details?.let { ThreadUsageSummary(it) }
            error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
            if (!connected && !loading) Text("Reconnect to change chat settings.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(12.dp))
        }
        ChatSettingsContent(state.session.config, preferences, connected, models, {}, vm.chatPreferences::setMemory,
            vm::loadChatPreferences, vm::configure, chooseProfile = vm.chatPreferences::setProfile)
        Text("Conversation", Modifier.padding(start = 20.dp, top = 24.dp, bottom = 10.dp), style = MaterialTheme.typography.titleSmall)
        ChatSettingsGroup {
            Row(Modifier.fillMaxWidth().padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                ChatMaintenanceAction("Refresh", R.drawable.ic_refresh_cw, connected, Modifier.weight(1f), action = vm::refreshSession)
                if (vm.supportsTitleGeneration()) ChatMaintenanceAction("New title", R.drawable.ic_square_pen, connected && !generating && !state.session.running,
                    Modifier.weight(1f), busy = generating, action = vm::regenerateTitle)
                ChatMaintenanceAction("Compact", R.drawable.ic_archive, connected && !state.session.running, Modifier.weight(1f), action = { vm.action("compact") })
            }
        }
        if (state.session.running) ZyraSettingRow(R.drawable.ic_x, "Clear queued messages", click = if (connected) ({ vm.action("clear_queue") }) else null)

    }
}
@Composable private fun ChatMaintenanceAction(title: String, icon: Int, enabled: Boolean, modifier: Modifier = Modifier, busy: Boolean = false, action: () -> Unit) {
    TextButton(action, modifier = modifier, enabled = enabled, shape = MaterialTheme.shapes.medium, contentPadding = PaddingValues(horizontal = 4.dp, vertical = 14.dp)) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) else AppIcon(icon, modifier = Modifier.size(20.dp))
            Text(title, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable fun ThreadUsageSummary(details: JSONObject) {
    val context = details.optJSONObject("context")
    val usage = details.optJSONObject("usage")
    val used = context?.number("usedTokens")
    val capacity = context?.number("windowTokens")
    val tokenCount = usage?.number("totalTokens") ?: usage?.let { listOfNotNull(it.number("inputTokens"), it.number("cachedInputTokens"), it.number("cacheWriteTokens"), it.number("outputTokens")).takeIf { values -> values.isNotEmpty() }?.sum() }
    var expanded by remember { mutableStateOf(false) }
    Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surfaceContainer) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("Context", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(used?.let { usageCompact(it.toLong()) + (capacity?.let { total -> " / " + usageCompact(total.toLong()) } ?: " tokens") } ?: "Not reported", style = MaterialTheme.typography.titleMedium)
                    }
                    IconButton({ expanded = true }, Modifier.size(36.dp)) { AppIcon(R.drawable.ic_info, "Activity details", Modifier.size(18.dp)) }
                }
                if (used != null && capacity != null && capacity > 0) LinearProgressIndicator(progress = { (used / capacity).toFloat().coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth().height(4.dp), gapSize = 0.dp, drawStopIndicator = {})
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .45f))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Tokens", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(tokenCount?.let { usageCompact(it.toLong()) } ?: "—", style = MaterialTheme.typography.titleLarge)
                    usage?.number("responses")?.let { Text("${it.toLong()} responses", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Model cost", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(usage?.let(::usageCost)?.takeUnless { it == "Unavailable" } ?: "—", style = MaterialTheme.typography.titleLarge)
                    Text(if (usage == null || usageCost(usage) == "Unavailable") "Not reported" else if (usage.optInt("estimatedResponses") > 0) "Estimated" else "Recorded", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
    if (expanded) ZyraSheet("Activity details", close = { expanded = false }) {
        ThreadActivityDetails(details)
    }
}
@Composable private fun ThreadMetric(label: String, value: Double?) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value?.let { NumberFormat.getIntegerInstance().format(it) } ?: "—", style = MaterialTheme.typography.bodySmall)
    }
}
private fun JSONObject.number(key: String): Double? = (opt(key) as? Number)?.toDouble()?.takeIf { it.isFinite() && it >= 0 }

@Composable internal fun ThreadActivityDetails(details: JSONObject) {
    val used = details.optJSONObject("context")?.number("usedTokens")
    val capacity = details.optJSONObject("context")?.number("windowTokens")
    val usage = details.optJSONObject("usage")
    Column(Modifier.padding(horizontal = 20.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        ThreadMetric("Context tokens", used)
        ThreadMetric("Context window", capacity)
        usage?.let {
            ThreadMetric("Input", it.number("inputTokens"))
            ThreadMetric("Cached input", it.number("cachedInputTokens"))
            ThreadMetric("Output", it.number("outputTokens"))
            if ((it.number("cacheWriteTokens") ?: 0.0) > 0) ThreadMetric("Cache writes", it.number("cacheWriteTokens"))
            if (it.optInt("unpricedResponses") > 0) Text("Some responses have no available price.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        details.optString("note").takeUnless { it.isBlank() || it == "null" }?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}
