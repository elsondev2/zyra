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
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import dev.zyra.mobile.data.MarkdownHtmlDetails

@Composable internal fun MarkdownDetails(details: MarkdownHtmlDetails) {
    val states = LocalMarkdownDisclosureState.current
    val open = states[details] ?: details.open
    val duration = if (LocalReduceMotion.current) 0 else 170
    val angle by animateFloatAsState(if (open) 90f else 0f, tween(duration), label = "Details disclosure")
    Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surfaceContainer.copy(alpha = .5f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = .65f))) {
        Column {
            TextButton(onClick = { states[details] = !open }, modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    AppIcon(R.drawable.ic_chevron_right, if (open) "Collapse details" else "Expand details", Modifier.size(16.dp).rotate(angle))
                    Text(markdownInline(details.summary), Modifier.weight(1f), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface)
                }
            }
            AnimatedVisibility(open, enter = expandVertically(tween(duration)) + fadeIn(tween(duration)), exit = shrinkVertically(tween(duration)) + fadeOut(tween(duration))) {
                Column(Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, bottom = 14.dp)) { RenderMarkdownNodes(details.firstChild) }
            }
        }
    }
}

