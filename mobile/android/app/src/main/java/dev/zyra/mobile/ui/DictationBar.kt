package dev.zyra.mobile.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import dev.zyra.mobile.dictation.DictationState

data class DictationActions(val finish: () -> Unit = {}, val retry: () -> Unit = {}, val cancel: () -> Unit = {})
@Composable fun DictationBar(state: DictationState, actions: DictationActions, connected: Boolean = true) {
    val color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .8f)
    Column(Modifier.fillMaxWidth().padding(4.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            IconButton(actions.cancel, Modifier.size(44.dp)) { AppIcon(R.drawable.ic_x, if (state.phase == "error") "Dismiss dictation" else "Cancel dictation", Modifier.size(20.dp)) }
            if (state.phase == "recording") {
                Text("${state.durationMs / 60000}:${(state.durationMs / 1000 % 60).toString().padStart(2, '0')}", style = MaterialTheme.typography.labelMedium)
                val levels = List(20) { index ->
                    val level by animateFloatAsState((state.levels.getOrNull(index) ?: 0f).coerceIn(0f, 1f), tween(if (LocalReduceMotion.current) 0 else 160), label = "Dictation level $index")
                    level
                }
                Canvas(Modifier.weight(1f).height(24.dp).padding(horizontal = 12.dp)) {
                    // Desktop recorder uses fine 2px strokes separated by 2px.
                    // Interpolate actual measured history across the available width.
                    val step = 4.dp.toPx()
                    val count = (size.width / step).toInt().coerceAtLeast(1)
                    for (i in 0 until count) {
                        val sample = i.toFloat() / (count - 1).coerceAtLeast(1) * levels.lastIndex
                        val a = sample.toInt(); val b = (a + 1).coerceAtMost(levels.lastIndex)
                        val level = levels[a] + (levels[b] - levels[a]) * (sample - a)
                        val height = 2.dp.toPx() + level * 16.dp.toPx()
                        drawRoundRect(color, Offset(i * step, (size.height - height) / 2), Size(2.dp.toPx(), height), CornerRadius(1.dp.toPx()))
                    }
                }
                FilledIconButton(actions.finish, Modifier.size(44.dp)) { AppIcon(R.drawable.ic_check, "Use dictation", Modifier.size(20.dp)) }
            } else {
                if (state.phase != "error") CircularProgressIndicator(Modifier.size(15.dp), strokeWidth = 1.5.dp)
                Text(when (state.phase) { "checking" -> "Getting ready…"; "uploading", "transcribing" -> "Transcribing…"; else -> "Dictation paused" }, Modifier.weight(1f).padding(horizontal = 8.dp), style = MaterialTheme.typography.labelMedium)
                if (state.retry) TextButton(actions.retry, enabled = state.insert || connected) { Text(if (state.insert) "Insert" else "Retry") }
            }
        }
        state.error?.let { Text(it, Modifier.padding(start = 8.dp, end = 8.dp, bottom = 8.dp), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
}
