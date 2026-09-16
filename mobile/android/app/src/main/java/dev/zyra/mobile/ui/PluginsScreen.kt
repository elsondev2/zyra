package dev.zyra.mobile.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay
import dev.zyra.mobile.R
import dev.zyra.mobile.data.*

data class PluginActions(val refresh: () -> Unit, val search: (String) -> Unit, val more: () -> Unit,
    val edit: () -> Unit, val toggle: (String) -> Unit, val save: () -> Unit, val review: () -> Unit, val confirm: () -> Unit, val store: () -> Unit = {}, val details: (String) -> Unit = {}, val machine: (() -> Unit)? = null, val scope: (() -> Unit)? = null)

@Composable fun PluginsScreen(controller: PluginsController, connected: Boolean, machine: String, store: () -> Unit, details: (String) -> Unit, machinePicker: (() -> Unit)? = null, scopePicker: (() -> Unit)? = null) {
    val state by controller.state.collectAsStateWithLifecycle()
    val actions = PluginActions(controller::refresh, controller::search, controller::more, controller::edit,
        controller::toggle, controller::save, controller::review, controller::confirm, store, details, machinePicker, scopePicker)
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(controller, connected, lifecycle) {
        if (connected) lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            // Only this visible settings page refreshes. Paused phones send no Plugin polling.
            while (true) {
                val current = controller.state.value
                if (!current.busy && !current.saving && !current.reviewing) controller.checkForChanges()
                delay(30_000)
            }
        }
    }
    PluginsContent(state, connected, machine, actions)
    if (state.editing) ZyraSheet("New chat defaults", controller::cancelEdit,
        footer = { PluginDefaultsFooter(state, connected, actions) }) { PluginDefaultsContent(state, connected, actions) }
    if (state.reviewing) ZyraSheet("Update this chat", controller::cancelReview,
        footer = {
            if (state.needsRefresh) ZyraOutlinedButton({ controller.cancelReview(); controller.refresh() }, Modifier.fillMaxWidth(), connected && !state.busy && !state.saving) { Text("Refresh and review again") }
            else ZyraButton(actions.confirm, Modifier.fillMaxWidth(), connected && !state.saving && !state.busy) { Text(if (state.saving) "Updating…" else "Use these versions") }
        }) {
        PluginReviewContent(state)
    }
}

@Composable private fun PluginCaption(text: String, modifier: Modifier = Modifier) {
    Text(text, modifier, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable private fun PluginGroup(title: String, subtitle: String, content: @Composable ColumnScope.() -> Unit) {
    Surface(shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(title, style = MaterialTheme.typography.titleMedium); PluginCaption(subtitle)
            }
            content()
        }
    }
}

@Composable private fun SavedPluginRow(plugin: ChatPlugin) {
    ZyraSettingRow(R.drawable.ic_puzzle, plugin.name.ifBlank { plugin.id },
        listOf(plugin.version, if (plugin.state == "active") "" else "${plugin.state.replaceFirstChar { it.uppercase() }} on PC").filter { it.isNotBlank() }.joinToString(" · "))
}

@Composable fun PluginsContent(state: PluginsState, connected: Boolean, machine: String, actions: PluginActions) {
    val catalog = state.catalog
    val ready = connected && state.loaded && !state.busy && !state.saving
    Box(Modifier.fillMaxSize()) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (state.loaded) {
            if (catalog.hasChat) item { PluginGroup("In this chat", "Saved versions keep this conversation consistent.") {
                if (catalog.current.isEmpty()) PluginCaption("No Plugins in this chat.", Modifier.padding(start = 18.dp, end = 18.dp, bottom = 18.dp))
                catalog.current.forEach { SavedPluginRow(it) }
                if (catalog.differs) ZyraOutlinedButton(actions.review, Modifier.fillMaxWidth().padding(14.dp), ready && !state.needsRefresh) {
                    Text("Review available changes")
                }
            } }
            item { ZyraSearchField(state.query, actions.search, "Find a plugin", Modifier.fillMaxWidth()) }
            if (catalog.plugins.isEmpty() && !state.busy) item { PluginCaption(if (state.query.isBlank()) "Find plugins in the store using the options menu." else "No plugins match this search.") }
            items(catalog.plugins, key = { it.id }) { plugin ->
                Surface(onClick = { actions.details(plugin.id) }, enabled = connected, shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
                    Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            AppIcon(R.drawable.ic_puzzle, modifier = Modifier.size(20.dp))
                            Text(plugin.name, Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
                            AppIcon(R.drawable.ic_chevron_right, modifier = Modifier.size(16.dp))
                        }
                        PluginCaption(listOf(plugin.version, "${plugin.skillCount} ${if (plugin.skillCount == 1) "skill" else "skills"}", plugin.state.replaceFirstChar { it.uppercase() }).filter { it.isNotBlank() }.joinToString(" · "))
                        if (plugin.description.isNotBlank()) Text(plugin.description, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        val unavailable = plugin.contributions.filter { it.second != "supported" }.joinToString { it.first }
                        if (unavailable.isNotBlank()) PluginCaption("Not available to chats yet: $unavailable")
                    }
                }
            }
            if (catalog.nextCursor != null) item { ZyraOutlinedButton(actions.more, Modifier.fillMaxWidth(), ready) { Text("Show more Plugins") } }
        }
    }
    if (!state.loaded && state.busy) CircularProgressIndicator(Modifier.align(Alignment.Center).size(24.dp), strokeWidth = 2.dp)
    (state.error ?: state.notice)?.let { message -> Snackbar(Modifier.align(Alignment.BottomCenter).padding(16.dp)) { Text(message) } }
    }
}

@Composable fun PluginDefaultsContent(state: PluginsState, connected: Boolean, actions: PluginActions) {
    Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        PluginCaption("Choose skills for new chats. Existing chats keep their saved versions.")
        ZyraSearchField(state.query, actions.search, "Find a Plugin", Modifier.fillMaxWidth())
        if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        if (state.editRevision != state.catalog.defaultsRevision) ZyraOutlinedButton(actions.edit, enabled = connected && !state.busy && !state.saving) { Text("Reload PC selection") }
        else if (state.needsRefresh) ZyraOutlinedButton(actions.refresh, enabled = connected && !state.busy && !state.saving) { Text("Refresh from PC") }
        PluginCaption("${state.selection.size} of ${state.catalog.selectionLimit} selected")
    }
    // Include selected defaults outside the current search/page so they can always be removed.
    val rows = state.catalog.plugins.map { Triple(it.id, it.name, it.selectable) }.toMutableList()
    if (state.query.isBlank()) state.catalog.defaults.filter { it.id in state.selection && rows.none { row -> row.first == it.id } }
        .forEach { rows.add(0, Triple(it.id, it.name, it.state == "active")) }
    rows.forEach { (id, name, selectable) ->
        val selected = id in state.selection
        ZyraSettingRow(R.drawable.ic_puzzle, name, if (!selectable) "Unavailable on PC" else null,
            modifier = Modifier.toggleable(selected, enabled = connected && !state.saving && (selected || selectable), role = Role.Checkbox, onValueChange = { actions.toggle(id) }),
            trailing = { ZyraSelectionMark(selected) })
    }
    if (rows.isEmpty() && !state.busy) PluginCaption("No Plugins match this search.", Modifier.padding(20.dp))
    if (state.catalog.nextCursor != null) ZyraOutlinedButton(actions.more, Modifier.fillMaxWidth().padding(horizontal = 20.dp), connected && !state.busy && !state.saving) { Text("Show more Plugins") }
}

@Composable fun PluginDefaultsFooter(state: PluginsState, connected: Boolean, actions: PluginActions) {
    ZyraButton(actions.save, Modifier.fillMaxWidth(), connected && !state.busy && !state.saving && !state.needsRefresh && state.editRevision == state.catalog.defaultsRevision) { Text(if (state.saving) "Saving…" else "Save defaults") }
}

@Composable fun PluginReviewContent(state: PluginsState) {
    val catalog = state.reviewCatalog ?: state.catalog
    Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        PluginCaption("This replaces the chat’s saved Plugin versions with the current defaults. Other chats keep their versions.")
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
    val next = catalog.defaults.filter { it.state == "active" }
    (catalog.current.map { it.id } + next.map { it.id }).distinct().forEach { id ->
        val before = catalog.current.find { it.id == id }
        val after = next.find { it.id == id }
        val detail = when {
            after == null -> "Remove from this chat"
            before == null -> "Add · ${after.version}"
            before.releaseId != after.releaseId -> "Update · ${before.version} → ${after.version}"
            else -> "Keep · ${after.version}"
        }
        ZyraSettingRow(R.drawable.ic_puzzle, (after ?: before)!!.name, detail)
    }
    if (catalog.current.isEmpty() && next.isEmpty()) PluginCaption("This chat will have no Plugins.", Modifier.padding(20.dp))
}
