package dev.zyra.mobile.ui

import androidx.compose.foundation.Image
import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import dev.zyra.mobile.R
import dev.zyra.mobile.data.*
import kotlinx.coroutines.awaitCancellation

data class PluginStoreActions(val refresh: () -> Unit, val search: (String) -> Unit, val category: (String) -> Unit, val more: () -> Unit,
    val select: (StorePlugin) -> Unit, val prepare: () -> Unit, val cancel: () -> Unit, val install: () -> Unit, val installed: () -> Unit)

@Composable fun PluginStoreScreen(controller: PluginStoreController, connected: Boolean, installed: () -> Unit) {
    val state by controller.state.collectAsStateWithLifecycle()
    val actions = PluginStoreActions(controller::refresh, controller::search, controller::category, controller::more, controller::select, controller::prepare, controller::cancel, controller::install, installed)
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(controller, connected, lifecycle) {
        if (connected) lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            controller.resume()
            try { awaitCancellation() } finally { controller.pause() }
        }
    }
    val listState = rememberLazyListState()
    val duration = if (LocalReduceMotion.current) 0 else 180
    LaunchedEffect(state.query, state.category) { listState.scrollToItem(0) }
    AnimatedContent(targetState = state.selected, contentKey = { it?.name ?: "catalog" }, modifier = Modifier.fillMaxSize(), transitionSpec = {
        ((fadeIn(tween(duration)) + slideInHorizontally(tween(duration)) { if (targetState != null) it / 12 else -it / 12 }) togetherWith fadeOut(tween(duration / 2))).using(null)
    }, contentAlignment = Alignment.TopStart, label = "Plugin details") { entry ->
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopStart) {
        if (entry == null) PluginStoreContent(state.copy(selected = null), connected, actions, listState)
        else PluginProductContent(state.copy(selected = entry), connected, actions)
        }
    }
}

@Composable fun PluginStoreIcon(name: String, modifier: Modifier = Modifier) {
    val resource = PluginLogos.resources[name]
    Surface(modifier.size(44.dp), shape = RoundedCornerShape(12.dp), color = if (resource != null) Color.White else MaterialTheme.colorScheme.surfaceContainerHighest) {
        Box(Modifier.padding(8.dp), contentAlignment = Alignment.Center) {
            if (resource != null) Image(painterResource(resource), contentDescription = null, modifier = Modifier.fillMaxSize())
            else AppIcon(R.drawable.ic_puzzle, modifier = Modifier.size(24.dp))
        }
    }
}

@Composable fun PluginStoreContent(state: PluginStoreState, connected: Boolean, actions: PluginStoreActions, listState: LazyListState = rememberLazyListState()) {
    var filter by remember { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxSize(), state = listState, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text("More ways to work", style = MaterialTheme.typography.headlineSmall)
                    Text("Explore the desktop Plugin catalog.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(actions.refresh, enabled = connected && !state.loading) {
                    if (state.loading) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                    else AppIcon(R.drawable.ic_refresh_cw, "Refresh Store", Modifier.size(20.dp))
                }
            }
        }
        item { Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            ZyraSearchField(state.query, actions.search, "Search Plugins", Modifier.weight(1f))
            IconButton({ filter = true }) { AppIcon(R.drawable.ic_filter, "Filter Plugins", Modifier.size(20.dp)) }
        } }
        if (!connected) item { Text("Reconnect to your PC to browse and prepare Plugins.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        state.error?.let { message -> item { Text(message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) } }
        if (state.category.isNotBlank()) item { Text(state.category, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary) }
        if (state.loaded && state.catalog.entries.isEmpty() && !state.loading) item { Text("No Plugins match. Try another search or category.", Modifier.padding(vertical = 24.dp)) }
        items(state.catalog.entries, key = { it.name }) { entry ->
            Surface(onClick = { actions.select(entry) }, modifier = Modifier.fillMaxWidth(), enabled = !state.working,
                shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        PluginStoreIcon(entry.name)
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Text(entry.title, style = MaterialTheme.typography.titleMedium)
                            Text(entry.publisher.ifBlank { entry.category }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        AppIcon(R.drawable.ic_chevron_right, modifier = Modifier.size(16.dp))
                    }
                    Text(entry.description, style = MaterialTheme.typography.bodyMedium)
                    Text(if (entry.installedVersion.isNotBlank()) "Installed · ${entry.installedVersion}${if (entry.installedState == "disabled") " · Disabled" else ""}"
                        else if (entry.installable) "Skills available" else "${entry.contributions.joinToString(" · ")} · Preview", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if (state.catalog.nextCursor != null) item { ZyraOutlinedButton(actions.more, Modifier.fillMaxWidth(), connected && !state.loading) { Text("Show more Plugins") } }
    }
    if (filter) ZyraSheet("Filter Plugins", { filter = false }, footer = { ZyraButton({ filter = false }, Modifier.fillMaxWidth()) { Text("Done") } }) {
        Column(Modifier.selectableGroup()) {
            (listOf("") + state.catalog.categories).forEach { category ->
                ZyraSettingRow(title = category.ifBlank { "All categories" }, modifier = Modifier.selectable(state.category == category, role = Role.RadioButton, onClick = { actions.category(category) }), trailing = { ZyraSelectionMark(state.category == category) })
            }
        }
    }
}

@Composable fun PluginProductContent(state: PluginStoreState, connected: Boolean, actions: PluginStoreActions) {
    val entry = state.selected ?: return
    val download = state.download
    val uri = LocalUriHandler.current
    var linkError by remember(entry.name) { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            item { Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                PluginStoreIcon(entry.name, Modifier.size(56.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(entry.title, style = MaterialTheme.typography.headlineSmall)
                    Text(entry.publisher, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } }
            item { Text(entry.detail.ifBlank { entry.description }, style = MaterialTheme.typography.bodyLarge) }
            item { Text(listOf(entry.category, entry.version, entry.license).filter { it.isNotBlank() }.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            if (entry.installedVersion.isNotBlank() && !state.installed) item { Text("Installed on PC · ${entry.installedVersion}${if (entry.installedState == "disabled") " · Disabled" else ""}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary) }
            if (entry.sourceUrl.isNotBlank()) item {
                ZyraOutlinedButton({ linkError = runCatching { uri.openUri(entry.sourceUrl) }.isFailure }) { AppIcon(R.drawable.ic_external_link, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(8.dp)); Text("View source") }
                if (linkError) Text("Could not open the source link.", color = MaterialTheme.colorScheme.error)
            }
            state.error?.let { error -> item { Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) } }
            if (state.installed) item { Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
                ZyraSettingRow(R.drawable.ic_check, "Installed on your PC", "Choose it in new chat defaults, then review changes for this chat.")
            } }
            else if (download?.status == "downloading") item { PluginDownloadProgress(download) }
            download?.review?.let { review -> item { PluginInstallReviewContent(review) } }
            if (download == null && !state.installed) item {
                Text(when {
                    !entry.hasSkills -> "This Plugin offers ${entry.contributions.joinToString(" and ")}. Those contributions are listed for reference and cannot run in Zyra chats yet."
                    !entry.installable -> "This Plugin cannot currently be installed from the desktop catalog."
                    !state.catalog.manageMachine -> "This phone can browse the Store. Installing Plugins requires access to all projects on this PC."
                    else -> "Your PC downloads and inspects this Plugin first. You can review its skills and capabilities before installing."
                }, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (state.installed || state.uncertain) ZyraOutlinedButton(actions.installed, Modifier.fillMaxWidth()) { Text("View installed Plugins") }
            if (download?.review != null && !state.uncertain) ZyraButton(actions.install, Modifier.fillMaxWidth(), connected && !state.working) { Text(if (state.working) "Installing…" else "Install on PC") }
            else if (download == null && !state.installed && !state.uncertain) ZyraButton(actions.prepare, Modifier.fillMaxWidth(), connected && !state.working && state.catalog.manageMachine && entry.installable) { Text(if (state.working) "Preparing…" else if (entry.installedVersion.isNotBlank()) "Prepare an update" else "Prepare on PC") }
            if (download != null || state.uncertain) ZyraOutlinedButton(actions.cancel, Modifier.fillMaxWidth(), connected && !state.working) { Text("Cancel preparation") }
        }
    }
}

@Composable fun PluginDownloadProgress(value: PluginDownload) {
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(when (value.phase) { "inspecting" -> "Inspecting on your PC"; "downloading" -> "Downloading to your PC"; else -> "Preparing the download" }, style = MaterialTheme.typography.titleSmall)
            if (value.totalBytes > 0 && value.phase == "downloading") LinearProgressIndicator(progress = { (value.completedBytes.toFloat() / value.totalBytes).coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth())
            else LinearProgressIndicator(Modifier.fillMaxWidth())
            if (value.totalFiles > 0) Text("${value.completedFiles} of ${value.totalFiles} files", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
