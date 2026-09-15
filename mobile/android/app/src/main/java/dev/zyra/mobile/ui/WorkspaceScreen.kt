package dev.zyra.mobile.ui

import androidx.compose.foundation.*
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.semantics.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.zyra.mobile.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun WorkspaceTopBar(controller: WorkspaceController, connected: Boolean, back: () -> Unit) {
    val state by controller.state.collectAsStateWithLifecycle()
    val review by controller.turnReview.state.collectAsStateWithLifecycle()
    val searchDuration = if (LocalReduceMotion.current) 0 else 160
    val name = (state.file?.path ?: if (state.turnReviewOpen) review.file?.path else state.diffPath.takeIf { state.diff != null })?.substringAfterLast('/')
        ?: review.selected?.takeIf { state.turnReviewOpen }?.let { "Turn ${it.number}" }
    WorkspaceHeader(name, state.git, connected && !state.saving && state.roots.isNotEmpty(), back,
        title = {
            val search = !state.git && state.fileSearchOpen
            AnimatedContent(search, transitionSpec = { (fadeIn(tween(searchDuration)) togetherWith fadeOut(tween(searchDuration))).using(null) }, label = "Folder search") { open ->
                if (open) {
                    val focus = remember { FocusRequester() }; LaunchedEffect(Unit) { focus.requestFocus() }
                    ZyraSearchField(state.fileQuery, controller::searchFiles, "Search this folder", Modifier.fillMaxWidth().focusRequester(focus))
                }
                else WorkspaceDestinationMenu(state, controller, connected && !state.saving)
            }
        },
        actions = {
            if (state.file == null && !state.git) IconButton({ controller.fileSearch(!state.fileSearchOpen) }, enabled = connected) { AppIcon(if (state.fileSearchOpen) R.drawable.ic_x else R.drawable.ic_search, if (state.fileSearchOpen) "Close search" else "Search files") }
            if (state.file != null) WorkspaceFileActions(state, controller, connected)
            else if (!state.git && !state.fileSearchOpen) WorkspaceFolderActions(state, controller, connected)
            else if (state.git && !state.turnReviewOpen && (state.gitTotal > 0 || state.diff != null || state.roots.size > 1)) WorkspaceGitHeaderActions(state, controller, connected)
            if (state.file == null && state.git) IconButton({ if (state.turnReviewOpen) controller.turnReview.refresh() else controller.refreshGit() }, enabled = connected && !state.busy && !review.busy) {
                if (state.busy || review.busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) else AppIcon(R.drawable.ic_refresh_cw, "Refresh changes")
            }
        }) { if (it) controller.changes() else controller.files() }
}
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun WorkspaceHeader(fileName: String?, git: Boolean, enabled: Boolean, back: () -> Unit, title: (@Composable () -> Unit)? = null, actions: @Composable RowScope.() -> Unit = {}, select: (Boolean) -> Unit) {
    TopAppBar(title = { if (fileName != null) Text(fileName, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleLarge)
        else if (title != null) title() else WorkspaceViewSwitch(git, enabled, select) },
        navigationIcon = { IconButton(back) { AppIcon(R.drawable.ic_arrow_left, "Back") } },
        actions = actions,
        colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background))
}
@Composable private fun WorkspaceDestinationMenu(state: WorkspaceState, controller: WorkspaceController, enabled: Boolean) {
    var menu by remember { mutableStateOf(false) }
    val current = if (!state.git) "Files" else if (state.turnReviewOpen) "Turn review" else "Git changes"
    Box {
        Surface(onClick = { menu = true }, enabled = enabled, color = Color.Transparent, shape = MaterialTheme.shapes.medium) {
            Row(Modifier.padding(vertical = 10.dp, horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(current, style = MaterialTheme.typography.titleLarge); AppIcon(R.drawable.ic_chevron_down, "Choose workspace view", Modifier.size(18.dp))
            }
        }
        DropdownMenu(menu, { menu = false }, shape = MaterialTheme.shapes.medium, containerColor = MaterialTheme.colorScheme.surfaceContainer) {
            DropdownMenuItem(text = { Text("Files") }, leadingIcon = { AppIcon(R.drawable.ic_folder) }, onClick = { menu = false; controller.files() })
            DropdownMenuItem(text = { Text("Turn review") }, leadingIcon = { AppIcon(R.drawable.ic_message_square) }, enabled = state.reviewAvailable,
                onClick = { menu = false; controller.changes() })
            DropdownMenuItem(text = { Text("Git changes") }, leadingIcon = { AppIcon(R.drawable.ic_git_branch) }, onClick = { menu = false; controller.git() })
        }
    }
}
@Composable fun WorkspaceViewSwitch(git: Boolean, enabled: Boolean, select: (Boolean) -> Unit) {
    var menu by remember { mutableStateOf(false) }
    Box {
        Surface(onClick = { menu = true }, enabled = enabled, color = Color.Transparent, shape = MaterialTheme.shapes.medium) {
            Row(Modifier.padding(vertical = 10.dp, horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(if (git) "Changes" else "Files", style = MaterialTheme.typography.titleLarge)
                AppIcon(R.drawable.ic_chevron_down, "Choose Files or Changes", Modifier.size(18.dp))
            }
        }
        DropdownMenu(menu, { menu = false }, shape = MaterialTheme.shapes.medium, containerColor = MaterialTheme.colorScheme.surfaceContainer, tonalElevation = 0.dp) {
            listOf(false to "Files", true to "Changes").forEach { (mode, title) ->
                DropdownMenuItem(text = { Text(title) }, leadingIcon = { AppIcon(if (mode) R.drawable.ic_git_branch else R.drawable.ic_folder) },
                    trailingIcon = { if (git == mode) AppIcon(R.drawable.ic_check, "Selected", Modifier.size(16.dp)) }, onClick = { menu = false; if (mode != git) select(mode) })
            }
        }
    }
}

data class WorkspaceCrumb(val label: String, val path: String)
fun workspaceCrumbs(path: String): List<WorkspaceCrumb> {
    var parent = ""
    return listOf(WorkspaceCrumb("Files", "")) + path.split('/').filter { it.isNotBlank() }.map { name ->
        parent = if (parent.isEmpty()) name else "$parent/$name"; WorkspaceCrumb(name, parent)
    }
}
fun workspaceRootLabel(root: WorkspaceRoot): String = if (root.label.lowercase().contains("global") && root.label.lowercase().contains("workspace")) "Chat files" else root.label

@Composable fun WorkspaceBreadcrumbs(path: String, enabled: Boolean, open: (String) -> Unit, modifier: Modifier = Modifier, currentClickable: Boolean = false, rootLabel: String = "Files") {
    val scroll = rememberScrollState()
    LaunchedEffect(path, scroll.maxValue) { scroll.scrollTo(scroll.maxValue) }
    Row(modifier.horizontalScroll(scroll), verticalAlignment = Alignment.CenterVertically) {
        val crumbs = remember(path) { workspaceCrumbs(path) }
        crumbs.forEachIndexed { i, crumb ->
            if (i > 0) AppIcon(R.drawable.ic_chevron_right, modifier = Modifier.size(12.dp))
            Surface(onClick = { open(crumb.path) }, enabled = enabled && (i < crumbs.lastIndex || currentClickable), shape = MaterialTheme.shapes.small, color = Color.Transparent) {
                Text(if (i == 0) rootLabel else crumb.label, Modifier.padding(horizontal = 8.dp, vertical = 10.dp), style = MaterialTheme.typography.labelMedium,
                    color = if (i == crumbs.lastIndex) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            }
        }
    }
}

@Composable fun WorkspaceScreen(controller: WorkspaceController, connected: Boolean) {
    val state by controller.state.collectAsStateWithLifecycle()
    val positions = remember(state.root) { linkedMapOf<String, Pair<Int, Int>>() }
    Box(Modifier.fillMaxSize()) {
    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        if (state.file == null && !state.git) Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            WorkspaceBreadcrumbs(state.path, connected && !state.busy, controller::directory, Modifier.weight(1f), rootLabel = state.roots.find { it.id == state.root }?.let(::workspaceRootLabel) ?: "Files")
        }
        when {
            state.turnReviewOpen -> TurnReviewScreen(controller.turnReview, Modifier.weight(1f))
            state.roots.isEmpty() && !state.busy -> Text("No folders from this chat are shared with your phone.", Modifier.padding(vertical = 24.dp))
            state.file != null -> key(state.root, state.file?.path) { WorkspaceFileContent(state, connected, controller::edit, controller::startEditing, controller::preview, controller::save, Modifier.weight(1f), folder = { state.file?.path?.let { controller.directory(it.substringBeforeLast('/', "")) } }, selectedLink = controller::selectFileLink, controller = controller) }
            state.git -> WorkspaceGitContent(state, connected, WorkspaceGitActions(controller::refreshGit, controller::gitSearch, controller::gitMode, controller::review, controller::moreChanges, {}), Modifier.weight(1f))
            else -> key(state.root) { WorkspaceDirectoryContent(state, connected, controller::file, controller::more, Modifier.weight(1f), positions) }
        }
    }
    if (state.busy) LinearProgressIndicator(Modifier.align(Alignment.TopCenter).fillMaxWidth().height(2.dp))
    val notice = state.error ?: if (!connected) "Reconnect to your PC to open or save files." else null
    notice?.let { message -> Surface(Modifier.align(Alignment.BottomCenter).padding(12.dp), shape = MaterialTheme.shapes.medium, color = if (state.error != null) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.surfaceContainerHigh) {
        Row(Modifier.padding(start = 14.dp, end = if (state.error == null) 14.dp else 0.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(message, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
            if (state.error != null) IconButton(controller::dismissError) { AppIcon(R.drawable.ic_x, "Dismiss error") }
        }
    } }
    }
    if (state.discard) ZyraSheet("Discard your edits?", { controller.discard(false) }, footer = {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            ZyraOutlinedButton({ controller.discard(false) }, Modifier.weight(1f)) { Text("Keep editing") }
            ZyraButton({ controller.discard(true) }, Modifier.weight(1f)) { Text("Discard") }
        }
    }) { Text("This file has changes that have not been saved to your PC.", Modifier.padding(horizontal = 20.dp), style = MaterialTheme.typography.bodyMedium) }
}

@Composable fun WorkspaceDirectoryContent(state: WorkspaceState, connected: Boolean, open: (WorkspaceEntry) -> Unit, more: () -> Unit, modifier: Modifier = Modifier, scrollPositions: MutableMap<String, Pair<Int, Int>>? = null) {
    val positions = scrollPositions ?: remember { linkedMapOf<String, Pair<Int, Int>>() }
    key(state.path, state.fileQuery) {
        val positionKey = state.path + "?" + state.fileQuery
        val initial = positions[positionKey]
        val list = rememberLazyListState(initial?.first ?: 0, initial?.second ?: 0)
        DisposableEffect(positionKey) { onDispose {
            positions[positionKey] = list.firstVisibleItemIndex to list.firstVisibleItemScrollOffset
            if (positions.size > 32) positions.remove(positions.keys.first())
        } }
        var requested by remember(state.path, state.hidden) { mutableStateOf<Int?>(null) }
        val nearEnd by remember(list, state.entries.size) { derivedStateOf { (list.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1) >= state.entries.size - 4 } }
        LaunchedEffect(nearEnd, state.nextOffset, state.busy, connected) {
            val next = state.nextOffset
            if (nearEnd && next != null && requested != next && connected && !state.busy && state.error == null) { requested = next; more() }
        }
        LazyColumn(modifier.fillMaxWidth(), state = list, contentPadding = PaddingValues(bottom = 24.dp)) {
            if (state.entries.isEmpty() && !state.busy) item {
                Text(if (state.fileQuery.isNotBlank()) "No matching files in this folder." else "This folder is empty.", Modifier.padding(vertical = 28.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            items(state.entries, key = { it.path }) { entry -> WorkspaceEntryRow(entry, connected && !state.busy) { open(entry) } }
            if (state.nextOffset != null && state.error != null) item { TextButton(more, enabled = connected && !state.busy) { Text("Retry loading files") } }
        }
    }
}

@Composable fun WorkspaceEntryRow(entry: WorkspaceEntry, enabled: Boolean, open: () -> Unit) {
    Surface(onClick = open, enabled = enabled && entry.accessible, color = Color.Transparent, shape = MaterialTheme.shapes.small) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            DesktopFileIcon(entry.path, entry.directory, modifier = Modifier.size(24.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(entry.name, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (!entry.accessible) Text("Outside shared folder", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (entry.directory) AppIcon(R.drawable.ic_chevron_right, modifier = Modifier.size(15.dp))
        }
    }
}



