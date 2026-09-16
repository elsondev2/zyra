package dev.zyra.mobile.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import dev.zyra.mobile.data.ConnectionState
import dev.zyra.mobile.data.ProjectMark
import dev.zyra.mobile.data.projectChoices

@Composable fun NewChatSheet(state: MobileState, close: () -> Unit, loadArtwork: (String, List<String>) -> Unit, create: (String, String) -> Unit) {
    var machineId by rememberSaveable { mutableStateOf(state.machines.singleOrNull()?.id) }
    var query by rememberSaveable(machineId) { mutableStateOf("") }
    val machine = state.machines.find { it.id == machineId }
    ZyraSheet(if (machine == null) "Choose a computer" else "New chat", close) {
        if (machine == null) {
            state.machines.forEach { pc -> ZyraSettingRow(R.drawable.ic_monitor, pc.name,
                connectionLabel(state.machineStatus[pc.id] ?: ConnectionState.Offline), click = { machineId = pc.id }) }
        } else {
            ZyraSettingRow(R.drawable.ic_monitor, machine.name, click = if (state.machines.size > 1) ({ machineId = null }) else null,
                trailing = { if (state.machines.size > 1) AppIcon(R.drawable.ic_chevron_down, "Change computer", Modifier.size(16.dp)) })
            HorizontalDivider(Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
            val connected = state.machineStatus[machine.id] == ConnectionState.Connected
            val paths = state.machineProjects[machine.id].orEmpty()
            val artwork: (String) -> ProjectMark? = { state.projectArtwork["${machine.id}:$it"] }
            val projects = projectChoices(paths, artwork).sortedWith(compareBy<String> { if (isPersonalChat(it)) 0 else 1 }.thenBy { projectLabel(it, artwork(it)).lowercase() })
            LaunchedEffect(machine.id, paths) { loadArtwork(machine.id, paths.take(96)) }
            if (!connected) Text("Open Zyra on this computer to start a chat.", Modifier.padding(horizontal = 20.dp, vertical = 10.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (projects.size > 6) ZyraSearchField(query, { query = it }, "Find a project", Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
            NewChatProjectRows(projects.filter { query.isBlank() || projectLabel(it, artwork(it)).contains(query, true) }, connected,
                artwork, { create(machine.id, it) })
        }
    }
}

@Composable fun ColumnScope.NewChatProjectRows(projects: List<String>, enabled: Boolean, artwork: (String) -> ProjectMark?, select: (String) -> Unit) {
    if (projects.isEmpty()) Text("No projects available", Modifier.padding(20.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    projects.forEach { project ->
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp).clip(MaterialTheme.shapes.medium).clickable(enabled) { select(project) }.padding(horizontal = 12.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (isPersonalChat(project)) AppIcon(R.drawable.ic_message_square, modifier = Modifier.size(20.dp)) else ProjectArtwork(artwork(project))
            Column(Modifier.weight(1f)) {
                Text(if (isPersonalChat(project)) "No project" else projectLabel(project, artwork(project)), style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (isPersonalChat(project)) Text("Start a conversation", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            AppIcon(R.drawable.ic_chevron_right, modifier = Modifier.size(16.dp))
        }
    }
}
