package dev.zyra.mobile.ui

import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.zyra.mobile.R

@Composable fun TurnReviewScreen(controller: TurnReviewController, modifier: Modifier = Modifier) {
    val state by controller.state.collectAsStateWithLifecycle()
    val list = rememberLazyListState()
    val detail = rememberLazyListState()
    var requested by remember { mutableStateOf<String?>(null) }
    val nearEnd by remember { derivedStateOf { (list.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1) >= list.layoutInfo.totalItemsCount - 3 } }
    LaunchedEffect(state.error) { if (state.error != null) requested = null }
    LaunchedEffect(state.selected?.id) { if (state.selected != null) detail.scrollToItem(0) }
    LaunchedEffect(nearEnd, state.next, state.busy, state.error, state.selected) {
        if (state.selected == null && state.error == null && nearEnd && state.next != null && state.next != requested && !state.busy) {
            requested = state.next; controller.more()
        }
    }
    val duration = if (LocalReduceMotion.current) 0 else 200
    Box(modifier.fillMaxSize()) {
        AnimatedContent(targetState = state, contentKey = { listOf(it.selected?.id, it.file?.activityId, it.file?.rootId, it.file?.path) },
            transitionSpec = { ((fadeIn(tween(duration)) + slideInHorizontally(tween(duration)) { if (reviewDepth(targetState) >= reviewDepth(initialState)) it / 12 else -it / 12 }) togetherWith fadeOut(tween(duration / 2))).using(null) }, label = "Turn review") { state ->
        Box(Modifier.fillMaxSize()) {
        if (state.file != null) {
            if (state.patch != null) GitDiffContent(state.patch.orEmpty(), true, Modifier.fillMaxSize())
            else if (state.busy) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp) }
            state.unavailable?.takeUnless { it == "too-large" && !state.patch.isNullOrBlank() }?.let {
                Text(TurnReviewController.unavailableLabel(it), Modifier.align(Alignment.Center).padding(20.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (state.truncated) Surface(Modifier.align(Alignment.BottomCenter).padding(12.dp), shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surfaceContainerHigh) {
                Text("Large diff · showing a preview", Modifier.padding(12.dp), style = MaterialTheme.typography.labelMedium)
            }
        } else if (state.selected != null) {
            val turn = state.selected!!
            LazyColumn(Modifier.fillMaxSize(), state = detail, contentPadding = PaddingValues(top = 8.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                item { TurnReviewMetadata(turn.state, turn.changes.distinctBy { it.rootId to it.path }.size) }
                val messages = if (state.detailLoaded) state.messages.ifEmpty { listOf(TurnReviewMessage("user", turn.prompt), TurnReviewMessage("assistant", turn.response)) } else emptyList()
                items(messages.filter { it.text.isNotBlank() }) { message ->
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(if (message.role == "user") "You" else "Response", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Markdown(message.text, preserveLineBreaks = message.role == "user")
                        if (message.truncated) Text("Long message · showing a preview", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                if (state.detailLoaded) {
                    item { HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant); Text("Files", Modifier.padding(top = 16.dp), style = MaterialTheme.typography.titleSmall) }
                    if (turn.changes.isEmpty()) item { Text("No files changed in this turn.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    items(turn.changes.distinctBy { Triple(it.activityId, it.rootId, it.path) }, key = { "${it.activityId}:${it.rootId}:${it.path}" }) { change -> TurnReviewFileRow(change) { controller.diff(turn, change) } }
                }
            }
        } else LazyColumn(Modifier.fillMaxSize(), state = list, contentPadding = PaddingValues(top = 8.dp, bottom = 32.dp)) {
            if (state.turns.isEmpty() && !state.busy) item { Text("No turns to review yet.", Modifier.padding(vertical = 24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
            items(state.turns, key = { it.id }) { turn ->
                val fileCount = turn.changes.distinctBy { it.rootId to it.path }.size
                Surface(onClick = { controller.select(turn) }, shape = MaterialTheme.shapes.medium, color = Color.Transparent) {
                    Row(Modifier.fillMaxWidth().padding(vertical = 14.dp, horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(turn.prompt.ifBlank { "Turn ${turn.number}" }, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleSmall)
                            TurnReviewMetadata(turn.state, fileCount, turn.number)
                        }
                        AppIcon(R.drawable.ic_chevron_right, "Review turn ${turn.number}", Modifier.size(16.dp))
                    }
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .5f))
            }
        }
        }
        }
        if (state.busy) LinearProgressIndicator(Modifier.align(Alignment.TopCenter).fillMaxWidth().height(2.dp))
        state.error?.let { error -> Surface(Modifier.align(Alignment.BottomCenter).padding(12.dp), shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.errorContainer) {
            Row(Modifier.padding(start = 14.dp), verticalAlignment = Alignment.CenterVertically) { Text(error, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall); IconButton(controller::refresh, enabled = !state.busy) { AppIcon(R.drawable.ic_refresh_cw, "Retry review") }; IconButton(controller::dismissError) { AppIcon(R.drawable.ic_x, "Dismiss") } }
        } }
    }
}

@Composable private fun TurnReviewFileRow(change: TurnReviewChange, open: () -> Unit) {
    Surface(onClick = open, color = Color.Transparent, shape = MaterialTheme.shapes.medium) {
        Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            DesktopFileIcon(change.path, modifier = Modifier.size(22.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(change.path.substringAfterLast('/'), maxLines = 1, style = MaterialTheme.typography.bodyMedium, overflow = TextOverflow.Ellipsis)
                change.path.substringBeforeLast('/', "").takeIf { it.isNotBlank() }?.let { Text(it, maxLines = 1, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, overflow = TextOverflow.Ellipsis) }
            }
            if (change.additions > 0) Text("+${change.additions}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
            if (change.deletions > 0) Text("−${change.deletions}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
            AppIcon(R.drawable.ic_chevron_right, "Review file", Modifier.size(14.dp))
        }
    }
}

private fun turnReviewStatus(state: String) = when (state) {
    "completed" -> "Completed"
    "running", "inProgress", "in_progress" -> "Working"
    "failed" -> "Failed"
    "cancelled", "interrupted" -> "Stopped"
    else -> "Ready"
}
private fun reviewDepth(state: TurnReviewState) = when { state.file != null -> 2; state.selected != null -> 1; else -> 0 }

