package dev.zyra.mobile.ui

import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

// Same Lucide Zap / ListEnd silhouettes as Desktop's busy-send control.
private val forceMessageIcon by lazy {
    ImageVector.Builder("Force", 24.dp, 24.dp, 24f, 24f).apply {
        path(fill = null, stroke = SolidColor(Color.Black), strokeLineWidth = 2f,
            strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round) {
            moveTo(13f, 2f); lineTo(3f, 14f); lineTo(12f, 14f)
            lineTo(11f, 22f); lineTo(21f, 10f); lineTo(12f, 10f); close()
        }
    }.build()
}
private val queueMessageIcon by lazy {
    ImageVector.Builder("Queue", 24.dp, 24.dp, 24f, 24f).apply {
        path(fill = null, stroke = SolidColor(Color.Black), strokeLineWidth = 2f,
            strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round) {
            moveTo(3f, 6f); lineTo(16f, 6f)
            moveTo(3f, 12f); lineTo(16f, 12f)
            moveTo(3f, 18f); lineTo(10f, 18f)
            moveTo(21f, 6f); lineTo(21f, 18f); lineTo(14f, 18f)
            moveTo(17f, 15f); lineTo(14f, 18f); lineTo(17f, 21f)
        }
    }.build()
}

@Composable internal fun BusySendModeItem(queued: Boolean, toggle: () -> Unit) {
    DropdownMenuItem(
        text = { Text(if (queued) "Queue next message" else "Force next message") },
        leadingIcon = { Icon(if (queued) queueMessageIcon else forceMessageIcon, contentDescription = null) },
        onClick = toggle,
    )
}
