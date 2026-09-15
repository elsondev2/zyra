package dev.zyra.mobile.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

/** Desktop's stepped Faster -> Smarter control, using the selected theme's accent. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun ThinkingSlider(model: String, levels: List<String>, effort: String, enabled: Boolean, commit: (String, String) -> Unit) {
    if (levels.isEmpty()) return
    var position by remember(model, levels, effort) { mutableFloatStateOf(levels.indexOf(effort).coerceAtLeast(0).toFloat()) }
    val index = position.roundToInt().coerceIn(levels.indices)
    val label = levels[index].replaceFirstChar { it.uppercase() }
    val fraction = if (levels.size <= 1) 1f else index.toFloat() / levels.lastIndex
    val fill by animateColorAsState(lerp(MaterialTheme.colorScheme.onSurfaceVariant, MaterialTheme.colorScheme.primary, .25f + .75f * fraction), label = "Thinking intensity")
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Thinking", Modifier.weight(1f), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(label, style = MaterialTheme.typography.labelMedium, color = fill)
        }
        if (levels.size > 1) Slider(value = position, onValueChange = { position = it }, valueRange = 0f..levels.lastIndex.toFloat(), steps = (levels.size - 2).coerceAtLeast(0),
            enabled = enabled, onValueChangeFinished = { if (levels[index] != effort) commit(model, levels[index]) },
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Thinking level"; stateDescription = label },
            colors = SliderDefaults.colors(thumbColor = fill, activeTrackColor = fill, inactiveTrackColor = MaterialTheme.colorScheme.outlineVariant),
            thumb = { Box(Modifier.size(18.dp).background(if (enabled) fill else MaterialTheme.colorScheme.outline, CircleShape)) })
        Row(Modifier.fillMaxWidth()) {
            Text("Faster", Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("Smarter", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
