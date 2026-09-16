package dev.zyra.mobile.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import dev.zyra.mobile.data.*

// A disclosure expresses reading intent before its size starts changing.
internal val LocalWorkDisclosure = staticCompositionLocalOf<() -> Unit> { {} }

@Composable fun TimelineWorkSummary(group: ChatRailRow.Work, inspect: (WorkAction) -> Unit,
    question: @Composable (TimelineItem) -> Unit = {}, media: @Composable (TimelineItem) -> Unit = {}) {
    val reading = LocalWorkDisclosure.current
    var expanded by rememberSaveable(group.id) { mutableStateOf(group.running && !group.finalVisible) }
    var previouslyWorking by rememberSaveable(group.id) { mutableStateOf(group.running && !group.finalVisible) }
    LaunchedEffect(group.running, group.finalVisible) {
        val working = group.running && !group.finalVisible
        // Collapse on completion, preserving a manually expanded finished turn
        // when returning from another page or restoring the app.
        if (previouslyWorking && !working) expanded = false
        previouslyWorking = working
    }
    val duration = if (LocalReduceMotion.current) 0 else 260
    val angle by animateFloatAsState(if (expanded) 90f else 0f, tween(duration), label = "Work disclosure")
    var now by remember(group.id) { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(group.id, group.running, group.finalVisible) { while (group.running && !group.finalVisible) { now = System.currentTimeMillis(); kotlinx.coroutines.delay(1000) } }
    val elapsed = workElapsed(group.startedAt, if (group.running && !group.finalVisible) now else group.completedAt)
    val showThoughts = LocalThoughtProcesses.current
    val segments = remember(group.entries, group.actions, showThoughts) { workSegments(group, showThoughtProcesses = showThoughts, showQuestions = false) }
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(MaterialTheme.shapes.small).clickable(role = Role.Button) { reading(); expanded = !expanded }
            .semantics { stateDescription = if (expanded) "Work expanded" else "Work collapsed" },
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (group.running && !group.finalVisible) CircularProgressIndicator(Modifier.size(12.dp), strokeWidth = 1.5.dp)
            Text((if (group.running && !group.finalVisible) "Working" else "Worked") + (elapsed?.takeIf { LocalWorkDetails.current }?.let { " for " + it } ?: ""), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f, fill = false), maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (LocalActionCounts.current && group.actions.isNotEmpty()) Text("· ${group.actions.size} ${if (group.actions.size == 1) "action" else "actions"}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            AppIcon(R.drawable.ic_chevron_right, if (expanded) "Hide work" else "Show work", Modifier.size(14.dp).rotate(angle))
        }
        HorizontalDivider(Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .65f))
        androidx.compose.animation.AnimatedVisibility(expanded, enter = expandVertically(tween(duration)) + fadeIn(tween(duration)), exit = shrinkVertically(tween(duration)) + fadeOut(tween(duration))) {
            Column(Modifier.fillMaxWidth().padding(top = 16.dp, bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                for (segment in segments) {
                    if (segment is WorkSegment.Actions) {
                        val batch = segment.actions
                        if (batch.size > 1) TimelineActionBatch(batch, group.running, inspect, media)
                        else TimelineActionRow(batch.single(), group.running, inspect, media)
                    } else if (segment is WorkSegment.Content) {
                        val item = segment.item
                        if (item.kind == "user_input_requested") question(item)
                        else if (item.kind != "resolved") {
                            if (LocalThoughtProcesses.current && item.reasoning.isNotBlank()) WorkThought(item)
                            if (item.text.isNotBlank()) Markdown(item.text)
                        }
                    }
                }
            }
        }
    }
}

@Composable private fun WorkThought(item: TimelineItem) {
    val reading = LocalWorkDisclosure.current
    var expanded by rememberSaveable(item.id) { mutableStateOf(false) }
    TextButton(onClick = { reading(); expanded = !expanded }, contentPadding = PaddingValues(horizontal = 4.dp)) {
        Text("Thought process", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        AppIcon(R.drawable.ic_chevron_right, modifier = Modifier.size(14.dp).rotate(if (expanded) 90f else 0f))
    }
    WorkDisclosure(expanded) { Column(Modifier.padding(start = 12.dp, bottom = 8.dp)) { Markdown(item.reasoning) } }
}

@Composable private fun TimelineActionBatch(actions: List<WorkAction>, running: Boolean, inspect: (WorkAction) -> Unit, media: @Composable (TimelineItem) -> Unit) {
    val reading = LocalWorkDisclosure.current
    var expanded by rememberSaveable(actions.first().item.id) { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(MaterialTheme.shapes.small).clickable(role = Role.Button) { reading(); expanded = !expanded }.padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (running && actions.any { it.item.pending }) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 1.5.dp) else AppIcon(R.drawable.ic_workflow, modifier = Modifier.size(16.dp))
        Text(workSegmentTitle(actions), Modifier.weight(1f), style = MaterialTheme.typography.labelMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
        if (LocalActionCounts.current) Text("${actions.size}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (actions.any { it.failed }) CompositionLocalProvider(LocalContentColor provides MaterialTheme.colorScheme.error) { AppIcon(R.drawable.ic_circle_alert, "Failed action", Modifier.size(14.dp)) }
        AppIcon(R.drawable.ic_chevron_right, if (expanded) "Hide actions" else "Show actions", Modifier.size(14.dp).rotate(if (expanded) 90f else 0f))
    }
    WorkDisclosure(expanded) { Column(Modifier.padding(start = 12.dp)) { actions.forEach { TimelineActionRow(it, running, inspect, media) } } }
}

@Composable private fun TimelineActionRow(action: WorkAction, running: Boolean, inspect: (WorkAction) -> Unit, media: @Composable (TimelineItem) -> Unit) {
    val reading = LocalWorkDisclosure.current
    var expanded by rememberSaveable(action.item.id) { mutableStateOf(false) }
    TimelineActionContent(action, running, expanded, { reading(); expanded = !expanded }, inspect, media)
}

@Composable fun TimelineActionContent(action: WorkAction, running: Boolean, expanded: Boolean, toggle: () -> Unit,
    inspect: (WorkAction) -> Unit, media: @Composable (TimelineItem) -> Unit = {}) {
    val icon = when (action.family) { "command" -> R.drawable.ic_terminal; "read" -> R.drawable.ic_file; "edit" -> R.drawable.ic_pencil; "search", "web-search" -> R.drawable.ic_search; "web-fetch" -> R.drawable.ic_external_link; "skill" -> R.drawable.ic_puzzle; "browser", "computer" -> R.drawable.ic_monitor; else -> R.drawable.ic_workflow }
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(MaterialTheme.shapes.small).clickable(role = Role.Button, onClick = toggle).padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (running && action.item.pending) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 1.5.dp) else AppIcon(icon, modifier = Modifier.size(16.dp))
            Text(action.title, Modifier.weight(1f), style = MaterialTheme.typography.labelMedium, maxLines = 2, overflow = TextOverflow.Ellipsis,
                color = if (action.failed) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
            if (action.failed) AppIcon(R.drawable.ic_circle_alert, "Failed", Modifier.size(14.dp))
            AppIcon(R.drawable.ic_chevron_right, if (expanded) "Hide output" else "Show output", Modifier.size(14.dp).rotate(if (expanded) 90f else 0f))
        }
        WorkDisclosure(expanded) { Column(Modifier.padding(start = 28.dp, top = 4.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            WorkActionEvidence(action)
            media(action.item)
            TextButton(onClick = { inspect(action) }, contentPadding = PaddingValues(0.dp)) { Text(if (action.family in setOf("read", "edit", "skill")) "Open captured source" else "Open details", style = MaterialTheme.typography.labelSmall) }
        }
        }
    }
}

@Composable private fun WorkDisclosure(expanded: Boolean, content: @Composable () -> Unit) {
    val duration = if (LocalReduceMotion.current) 0 else 220
    androidx.compose.animation.AnimatedVisibility(expanded, enter = expandVertically(tween(duration)) + fadeIn(tween(duration)),
        exit = shrinkVertically(tween(duration)) + fadeOut(tween(duration))) { content() }
}




