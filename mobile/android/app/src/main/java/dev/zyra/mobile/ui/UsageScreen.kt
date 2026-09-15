package dev.zyra.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import dev.zyra.mobile.data.ConnectionState
import kotlinx.coroutines.isActive
import org.json.JSONObject
import java.text.NumberFormat
import java.util.Locale

private val usageHarnesses = linkedMapOf("zyra" to "Zyra", "codex" to "Codex", "claude" to "Claude", "opencode" to "OpenCode", "all" to "All harnesses")
@Composable fun UsageScreen(state: MobileState, request: suspend (String, String) -> JSONObject) =
    UsageLimitsScreen(state, request)

@Composable fun UsageDestinationTitle(page: String, select: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        Surface(onClick = { open = true }, color = Color.Transparent, shape = MaterialTheme.shapes.medium) {
            Row(Modifier.padding(vertical = 10.dp, horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(if (page == "usage") "Usage" else "Limits", style = MaterialTheme.typography.titleLarge)
                AppIcon(R.drawable.ic_chevron_down, "Choose Limits or Usage", Modifier.size(18.dp))
            }
        }
        DropdownMenu(open, { open = false }, shape = MaterialTheme.shapes.medium, containerColor = MaterialTheme.colorScheme.surfaceContainer) {
            listOf("limits" to "Limits", "usage" to "Usage").forEach { (value, title) ->
                DropdownMenuItem(text = { Text(title) }, trailingIcon = { if ((page == "usage") == (value == "usage")) AppIcon(R.drawable.ic_check, "Selected", Modifier.size(16.dp)) },
                    onClick = { open = false; if (value != page) select(value) })
            }
        }
    }
}

/** Account allowances and recorded activity are separate destinations, sharing only the machine selector. */
@Composable fun UsageLimitsScreen(state: MobileState, usageRequest: suspend (String, String) -> JSONObject,
    limitsRequest: (suspend (String) -> JSONObject)? = null) {
    val showUsage = state.page == "usage" || limitsRequest == null
    var machineId by remember { mutableStateOf(state.machine?.id ?: state.machines.firstOrNull()?.id) }
    val selected = state.machines.find { it.id == machineId } ?: state.machines.firstOrNull()
    val status = state.machineStatus[selected?.id] ?: if (selected?.id == state.machine?.id) state.connection else null
    val waiting = selected != null && (status == null || status == ConnectionState.Connecting || status == ConnectionState.Reconnecting)
    var harness by remember { mutableStateOf("zyra") }
    var picker by remember { mutableStateOf("") }; var revision by remember { mutableIntStateOf(0) }
    var result by remember(selected?.id, harness) { mutableStateOf<JSONObject?>(null) }
    var limits by remember(selected?.id) { mutableStateOf<JSONObject?>(null) }
    var busy by remember(selected?.id, harness) { mutableStateOf(selected != null) }
    var limitsBusy by remember(selected?.id) { mutableStateOf(selected != null && limitsRequest != null) }
    var error by remember(selected?.id, harness) { mutableStateOf<String?>(null) }
    var limitsError by remember(selected?.id) { mutableStateOf<String?>(null) }
    LaunchedEffect(selected?.id, status, harness, revision, showUsage) {
        if (!showUsage) { busy = false; return@LaunchedEffect }
        busy = status == ConnectionState.Connected; error = null
        try { error = dev.zyra.mobile.network.MachineUsageLoader.load(selected?.id, status, harness, usageRequest) { result = it }.error }
        finally { if (kotlinx.coroutines.currentCoroutineContext().isActive) busy = false }
    }
    LaunchedEffect(selected?.id, status, revision, limitsRequest != null, showUsage) {
        if (showUsage || limitsRequest == null) return@LaunchedEffect
        limitsBusy = status == ConnectionState.Connected; limitsError = null
        try {
            val loaded = dev.zyra.mobile.network.MachineLimitsLoader.load(selected?.id, status, limitsRequest)
            loaded.data?.let { limits = it }; limitsError = loaded.error
        } finally { if (kotlinx.coroutines.currentCoroutineContext().isActive) limitsBusy = false }
    }
    Column(Modifier.fillMaxSize().padding(horizontal = 20.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) {
                TextButton({ picker = "machine" }, enabled = state.machines.size > 1, colors = ButtonDefaults.textButtonColors(disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant)) {
                    AppIcon(R.drawable.ic_monitor, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(8.dp))
                    Text(selected?.name ?: "No computer paired", Modifier.weight(1f, fill = false), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (state.machines.size > 1) AppIcon(R.drawable.ic_chevron_down, modifier = Modifier.size(16.dp))
                }
                DropdownMenu(picker == "machine", { picker = "" }, shape = MaterialTheme.shapes.medium, containerColor = MaterialTheme.colorScheme.surfaceContainer) {
                    state.machines.forEach { machine -> DropdownMenuItem(text = { Text(machine.name) }, onClick = { machineId = machine.id; picker = "" }, trailingIcon = { if (selected?.id == machine.id) AppIcon(R.drawable.ic_check) }) }
                }
            }
            if (showUsage) Box {
                TextButton({ picker = "harness" }) { Text(usageHarnesses[harness].orEmpty()); AppIcon(R.drawable.ic_chevron_down, modifier = Modifier.size(16.dp)) }
                DropdownMenu(picker == "harness", { picker = "" }, shape = MaterialTheme.shapes.medium, containerColor = MaterialTheme.colorScheme.surfaceContainer) {
                    usageHarnesses.forEach { (id, label) -> DropdownMenuItem(text = { Text(label) }, onClick = { harness = id; picker = "" }, trailingIcon = { if (harness == id) AppIcon(R.drawable.ic_check) }) }
                }
            }
            IconButton({ revision++ }, enabled = !(if (showUsage) busy else limitsBusy) && !waiting && status == ConnectionState.Connected) {
                if ((if (showUsage) busy else limitsBusy) || waiting) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) else AppIcon(R.drawable.ic_refresh_cw, if (showUsage) "Refresh usage" else "Refresh limits")
            }
        }
        if (selected == null) Text("Pair a computer to view ${if (showUsage) "usage" else "limits"}.", Modifier.padding(vertical = 16.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        else if (showUsage) UsageContent(result ?: JSONObject(), busy || waiting, header = error?.let { message -> {
            Text(if (result != null) "Showing saved usage · $message" else message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        } }) { revision++ }
        else LimitsContent(limits, limitsBusy || waiting, limitsError)
    }
}

@Composable internal fun UsageContent(result: JSONObject, busy: Boolean = false, header: (@Composable () -> Unit)? = null, refresh: () -> Unit = {}) {
    val totals = result.optJSONObject("totals") ?: JSONObject()
    val models = result.optJSONArray("models")
    var coverageDetails by remember { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        if (header != null) item { header() }
        item { Text("Last 30 days · Shared projects", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        if (totals.optInt("responses") > 0) item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column(Modifier.weight(1f)) { Text(usageCompact(totals.optLong("totalTokens")), style = MaterialTheme.typography.headlineMedium); Text("recorded tokens", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.End) { Text(usageCost(totals), style = MaterialTheme.typography.titleLarge); Text("model cost", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
        }
        if (!busy && (result.optBoolean("indexing") || result.optBoolean("limited") || result.optBoolean("partial"))) item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Partial history", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                IconButton({ coverageDetails = !coverageDetails }, Modifier.size(36.dp)) { AppIcon(R.drawable.ic_info, "Usage coverage", Modifier.size(16.dp)) }
            }
        }
        if (!busy && result.has("totals") && totals.optInt("responses") == 0) item {
            Text(if (result.optBoolean("indexing")) "Reading recorded usage from this computer." else "No recorded usage is available from shared projects for this source.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        result.optJSONArray("daily")?.takeIf { it.length() > 0 }?.let { daily -> item {
            UsageChart(daily, result.optBoolean("partial") || result.optBoolean("indexing") || result.optBoolean("limited"))
        } }
        if ((models?.length() ?: 0) > 0) item { Text("By model", style = MaterialTheme.typography.titleSmall) }
        for (i in 0 until (models?.length() ?: 0)) item {
            val model = models!!.getJSONObject(i)
            var expanded by remember(model.optString("harness"), model.optString("model")) { mutableStateOf(false) }
            Column {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(model.optString("model"), style = MaterialTheme.typography.titleSmall)
                        Text("${usageNumber(model.optLong("totalTokens"))} tokens · ${usageHarnesses[model.optString("harness")].orEmpty()}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text(usageCost(model), style = MaterialTheme.typography.labelLarge)
                    IconButton({ expanded = !expanded }) { AppIcon(R.drawable.ic_chevron_down, "Token breakdown", Modifier.size(18.dp).rotate(if (expanded) 180f else 0f)) }
                }
                val modelShare = (model.optDouble("totalTokens", 0.0) / totals.optDouble("totalTokens", 1.0).coerceAtLeast(1.0)).toFloat().coerceIn(0f, 1f)
                LinearProgressIndicator(progress = { modelShare }, modifier = Modifier.fillMaxWidth().height(3.dp), color = MaterialTheme.colorScheme.primary, trackColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .35f), drawStopIndicator = {})
                if (expanded) {
                    UsageValue("Input", usageNumber(model.optLong("inputTokens")))
                    UsageValue("Cached input", usageNumber(model.optLong("cachedInputTokens")))
                    UsageValue("Cache writes", usageNumber(model.optLong("cacheWriteTokens")))
                    UsageValue("Output", usageNumber(model.optLong("outputTokens")))
                    if (model.optInt("reportedResponses") > 0) UsageValue("Recorded model cost", usageMoney(model.optDouble("reportedCostUsd")))
                    if (model.optInt("estimatedResponses") > 0) UsageValue("Estimated API cost", usageMoney(model.optDouble("estimatedCostUsd")))
                    if (model.optInt("unpricedResponses") > 0) Text("${model.optInt("unpricedResponses")} responses have no known price.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        item { TextButton({ coverageDetails = true }, contentPadding = PaddingValues(0.dp)) { AppIcon(R.drawable.ic_info, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)); Text("About these numbers") } }
    }
    if (coverageDetails) ZyraSheet("Usage details", close = { coverageDetails = false }) {
        Column(Modifier.fillMaxWidth().weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(result.optString("note").ifBlank { "Recorded activity and API estimates come from this computer. They are separate from subscription allowances." }, style = MaterialTheme.typography.bodyMedium)
            val sources = result.optJSONArray("sources")
            for (i in 0 until (sources?.length() ?: 0)) {
                val source = sources!!.getJSONObject(i)
                val description = when (source.optString("state")) {
                    "unavailable" -> "Local history could not be read"
                    "not-found" -> "No local history found"
                    "no-visible-usage" -> "No recent activity in shared projects"
                    "indexing" -> "Some history is not included yet"
                    else -> "Recent local activity included"
                }
                Text("${usageHarnesses[source.optString("harness")].orEmpty()} · $description", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable private fun UsageValue(label: String, value: String) { Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.SpaceBetween) { Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(value, style = MaterialTheme.typography.bodySmall) } }
internal fun usageCompact(number: Long): String = when { number >= 1000000000 -> String.format(Locale.US, "%.1fB", number / 1000000000.0); number >= 1000000 -> String.format(Locale.US, "%.1fM", number / 1000000.0); number >= 10000 -> String.format(Locale.US, "%.1fk", number / 1000.0); else -> usageNumber(number) }
private fun usageNumber(number: Long) = NumberFormat.getIntegerInstance().format(number)
internal fun usageMoney(number: Double) = NumberFormat.getCurrencyInstance(Locale.US).apply { maximumFractionDigits = if (number < 1) 4 else 2 }.format(number)
internal fun usageCost(row: JSONObject): String = if (row.optInt("reportedResponses") + row.optInt("estimatedResponses") == 0) "Unavailable" else
    (if (row.optInt("estimatedResponses") > 0) "~" else "") + usageMoney(row.optDouble("reportedCostUsd", 0.0) + row.optDouble("estimatedCostUsd", 0.0)) + if (row.optInt("unpricedResponses") > 0) "+" else ""

