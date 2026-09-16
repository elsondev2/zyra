package dev.zyra.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import dev.zyra.mobile.data.ConnectionState
import dev.zyra.mobile.network.MachineLimitsLoader
import kotlinx.coroutines.isActive
import org.json.JSONObject

@Composable fun LimitsScreen(state: MobileState, request: suspend (String) -> JSONObject) {
    var machineId by remember { mutableStateOf(state.machine?.id ?: state.machines.firstOrNull()?.id) }
    val selected = state.machines.find { it.id == machineId } ?: state.machines.firstOrNull()
    val connection = state.machineStatus[selected?.id] ?: if (selected?.id == state.machine?.id) state.connection else null
    val waiting = selected != null && (connection == null || connection == ConnectionState.Connecting || connection == ConnectionState.Reconnecting)
    var choosing by remember { mutableStateOf(false) }; var revision by remember { mutableIntStateOf(0) }
    var result by remember(selected?.id) { mutableStateOf<JSONObject?>(null) }
    var busy by remember(selected?.id, connection) { mutableStateOf(selected != null && connection == ConnectionState.Connected) }; var error by remember(selected?.id, connection) { mutableStateOf<String?>(null) }
    LaunchedEffect(selected?.id, connection, revision) {
        busy = connection == ConnectionState.Connected; error = null
        try {
            val loaded = MachineLimitsLoader.load(selected?.id, connection, request)
            loaded.data?.let { result = it }
            error = loaded.error
        }
        finally { if (kotlinx.coroutines.currentCoroutineContext().isActive) busy = false }
    }
    Column(Modifier.fillMaxSize().padding(horizontal = 20.dp)) {
        Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton({ choosing = true }, enabled = state.machines.size > 1, modifier = Modifier.weight(1f), colors = ButtonDefaults.textButtonColors(disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant)) {
                AppIcon(R.drawable.ic_monitor, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(8.dp))
                Text(selected?.name ?: "No computer paired", Modifier.weight(1f, fill = false), maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (state.machines.size > 1) { Spacer(Modifier.width(6.dp)); AppIcon(R.drawable.ic_chevron_down, modifier = Modifier.size(15.dp)) }
            }
            IconButton({ revision++ }, enabled = selected != null && !busy && !waiting && connection == ConnectionState.Connected) {
                if (busy || waiting) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) else AppIcon(R.drawable.ic_refresh_cw, "Refresh limits")
            }
        }
        LimitsContent(result, busy || waiting, error)

    }
    if (choosing) ZyraSheet("Choose a computer", { choosing = false }) {
        state.machines.forEach { machine -> ZyraSettingRow(R.drawable.ic_monitor, machine.name, click = { machineId = machine.id; choosing = false }, trailing = { if (selected?.id == machine.id) AppIcon(R.drawable.ic_check, "Selected") }) }
    }
}
@Composable internal fun LimitsGroup(group: JSONObject) {
    val wrapper = JSONObject().put("groups", org.json.JSONArray().put(group))
    dev.zyra.mobile.data.AccountLimitPresentation.groups(wrapper).forEach { LimitsGroupContent(it) }
}

@Composable internal fun LimitsGroupContent(group: dev.zyra.mobile.data.AccountLimitGroup) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(group.label, style = MaterialTheme.typography.titleMedium)
        Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surfaceContainer) {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                group.windows.forEachIndexed { index, window ->
                    if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .45f))
                    LimitQuotaChart(window)
                }
            }
        }
    }
}

@Composable internal fun LimitsContent(result: JSONObject?, busy: Boolean, error: String?) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = 8.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        item { AccountLimitsOverview(result, busy, error) }
    }
}

/** The limits page contains only account allowances; activity has its own destination. */
@Composable internal fun AccountLimitsOverview(result: JSONObject?, busy: Boolean, error: String?) {
    var explanation by remember { mutableStateOf(false) }
    val groups = remember(result) { dev.zyra.mobile.data.AccountLimitPresentation.groups(result) }
    val updated = remember(result?.optString("fetchedAt")) {
        runCatching { java.time.Instant.parse(result?.optString("fetchedAt")) }.getOrNull()?.let {
            java.text.DateFormat.getDateTimeInstance(java.text.DateFormat.SHORT, java.text.DateFormat.SHORT).format(java.util.Date.from(it))
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(if (error != null && groups.isNotEmpty()) "Saved limits" else "Account allowances", style = MaterialTheme.typography.labelLarge)
                updated?.let { Text("Updated $it", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            IconButton({ explanation = true }, Modifier.size(40.dp)) { AppIcon(R.drawable.ic_info, "About account limits", Modifier.size(18.dp)) }
        }
        if (error != null && groups.isNotEmpty()) Text("Could not refresh · showing the last snapshot", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.error)
        if (groups.isEmpty()) {
            if (busy) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                Text("Loading limits…", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            else Text(error ?: result?.optString("unavailableReason")?.takeIf { it.isNotBlank() && it != "null" } ?: "Limits are not available from this computer.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else groups.forEach { LimitsGroupContent(it) }
    }
    if (explanation) ZyraSheet("Account limits", close = { explanation = false }) {
        Column(Modifier.padding(horizontal = 20.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("These allowances belong to the account connected on this computer. Computers using the same account share its limits.", style = MaterialTheme.typography.bodyMedium)
            Text("The charts show the remaining allowance in each provider window. Recorded tokens and model costs are in Usage.", style = MaterialTheme.typography.bodyMedium)
            error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
        }
    }
}
