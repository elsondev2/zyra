package dev.zyra.mobile.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import kotlin.math.cos
import kotlin.math.sin

/** A theme-colored dial: one recognizable control for model and thinking. */
@Composable fun ThinkingGaugeIcon(effort: String, modifier: Modifier = Modifier, label: String = "Model and thinking") {
    val level = when (effort.lowercase()) {
        "none", "off" -> 0f; "minimal" -> .14f; "low" -> .28f
        "high" -> .64f; "xhigh" -> .78f; "max" -> .9f; "ultra" -> 1f
        else -> .46f
    }
    val position by animateFloatAsState(level, tween(if (LocalReduceMotion.current) 0 else 220), label = "Thinking dial")
    val ink = MaterialTheme.colorScheme.onSurfaceVariant
    val accent = MaterialTheme.colorScheme.primary
    Canvas(modifier.size(20.dp).semantics {
        contentDescription = label
        stateDescription = effort.replaceFirstChar { it.uppercase() }.ifBlank { "Default thinking" }
    }) {
        val unit = size.minDimension / 24f
        val origin = Offset(size.width / 2f, size.height / 2f + unit)
        val radius = 9f * unit
        val corner = origin - Offset(radius, radius)
        val bounds = Size(radius * 2, radius * 2)
        drawArc(ink.copy(alpha = .35f), 145f, 250f, false, corner, bounds, style = Stroke(1.7f * unit, cap = StrokeCap.Round))
        drawArc(accent, 145f, 15f + 235f * position, false, corner, bounds, style = Stroke(1.7f * unit, cap = StrokeCap.Round))
        for (tick in 0..4) {
            val angle = Math.toRadians((145f + tick * 62.5f).toDouble())
            val direction = Offset(cos(angle).toFloat(), sin(angle).toFloat())
            drawLine(ink, origin + direction * (6.1f * unit), origin + direction * (7.1f * unit), unit, StrokeCap.Round)
        }
        val angle = Math.toRadians((145f + position * 250f).toDouble())
        drawLine(accent, origin, origin + Offset(cos(angle).toFloat(), sin(angle).toFloat()) * (5f * unit), 1.8f * unit, StrokeCap.Round)
        drawCircle(accent, 1.7f * unit, origin)
    }
}
