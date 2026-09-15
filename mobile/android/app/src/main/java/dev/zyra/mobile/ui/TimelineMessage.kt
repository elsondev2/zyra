package dev.zyra.mobile.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import dev.zyra.mobile.data.TimelineItem
import kotlinx.coroutines.delay

@Composable fun TimelineMessage(item: TimelineItem, media: @Composable () -> Unit = {}, copyable: Boolean = true, questionAnswers: List<dev.zyra.mobile.data.QuestionAnswer> = emptyList(), inspect: () -> Unit) {
    var reasoningOpen by rememberSaveable(item.id) { mutableStateOf(false) }
    var expanded by rememberSaveable(item.id) { mutableStateOf(false) }
    var copied by remember { mutableStateOf(false) }
    val clipboard = LocalClipboardManager.current
    LaunchedEffect(copied) { if (copied) { delay(1600); copied = false } }
    val duration = if (LocalReduceMotion.current) 0 else 180
    val angle by animateFloatAsState(if (reasoningOpen) 180f else 0f, tween(duration), label = "Reasoning disclosure")
    val user = item.role == "user"
    val attachmentBody = remember(item.text, user) { if (user) dev.zyra.mobile.data.MessageAttachments.parse(item.text) else dev.zyra.mobile.data.MessageAttachmentContent(item.text) }
    Column(Modifier.fillMaxWidth(), horizontalAlignment = if (user) Alignment.End else Alignment.Start, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (user) {
            BoxWithConstraints(Modifier.fillMaxWidth(), contentAlignment = Alignment.TopEnd) {
            Surface(Modifier.widthIn(max = maxWidth * .88f), shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surfaceContainer,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = .5f))) {
                Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
                    media()
                    if (questionAnswers.isNotEmpty()) QuestionResponseSummary(questionAnswers) else {
                        if (attachmentBody.body.isNotBlank()) Markdown(attachmentBody.body, preserveLineBreaks = true, selectable = copyable)
                        if (attachmentBody.files.isNotEmpty()) { Spacer(Modifier.height(8.dp)); MessageFiles(attachmentBody.files) }
                    }
                }
            }
            }
        } else {
            if (LocalThoughtProcesses.current && item.reasoning.isNotBlank()) {
                TextButton(onClick = { reasoningOpen = !reasoningOpen }, contentPadding = PaddingValues(0.dp)) {
                    Text(if (item.kind == "stream" && item.text.isBlank()) "Thinking…" else "Thought process", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.width(6.dp)); AppIcon(R.drawable.ic_chevron_down, if (reasoningOpen) "Collapse reasoning" else "Expand reasoning", Modifier.size(14.dp).rotate(angle))
                }
                AnimatedVisibility(reasoningOpen, enter = expandVertically(tween(duration)) + fadeIn(tween(duration)), exit = shrinkVertically(tween(duration)) + fadeOut(tween(duration))) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        VerticalDivider(Modifier.height(28.dp), color = MaterialTheme.colorScheme.outline)
                        Column(Modifier.weight(1f).padding(bottom = 8.dp)) { Markdown(item.reasoning) }
                    }
                }
            }
            if (item.text.isNotBlank()) Markdown(item.text)
            else if (item.kind == "stream" && item.reasoning.isBlank() && item.toolNames.isEmpty()) Text("Working…", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
            media()
            if (item.toolNames.any { it != "request_user_input" }) TextButton(onClick = inspect, contentPadding = PaddingValues(0.dp)) {
                AppIcon(R.drawable.ic_terminal, modifier = Modifier.size(15.dp)); Spacer(Modifier.width(8.dp))
                Text(item.toolNames.joinToString(" · "), style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                Spacer(Modifier.width(6.dp)); AppIcon(R.drawable.ic_chevron_right, "Inspect tool calls", Modifier.size(14.dp))
            }
        }
        if (copyable && item.text.isNotBlank() && item.kind != "stream") {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            IconButton(onClick = { clipboard.setText(AnnotatedString(item.text)); copied = true }, modifier = Modifier.size(36.dp)) { AppIcon(if (copied) R.drawable.ic_check else R.drawable.ic_copy, if (copied) "Copied" else "Copy message", Modifier.size(15.dp)) }
            if (LocalMessageTimestamps.current) {
                val timestamp = remember(item.raw) { runCatching { dev.zyra.mobile.data.WorkActions.timestamp(org.json.JSONObject(item.raw)) }.getOrNull() }
                timestamp?.let { Text(android.text.format.DateFormat.getTimeFormat(androidx.compose.ui.platform.LocalContext.current).format(java.util.Date(it)), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            }
        }
    }
}

@Composable fun TimelineTool(item: TimelineItem, inspect: () -> Unit) {
    val heading = item.text.lineSequence().firstOrNull().orEmpty().take(120)
    val output = item.text.substringAfter('\n', "")
    Surface(onClick = inspect, shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surfaceContainer.copy(alpha = .55f), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (item.pending) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 1.5.dp) else AppIcon(R.drawable.ic_terminal, modifier = Modifier.size(17.dp))
                Text(heading.ifBlank { "Tool output" }, Modifier.weight(1f), style = MaterialTheme.typography.labelMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                AppIcon(R.drawable.ic_chevron_right, "View output", Modifier.size(14.dp))
            }
            if (!item.pending && output.isNotBlank()) Text(output.take(360), style = MaterialTheme.typography.bodySmall.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace), color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 3, overflow = TextOverflow.Ellipsis)
        }
    }
}

