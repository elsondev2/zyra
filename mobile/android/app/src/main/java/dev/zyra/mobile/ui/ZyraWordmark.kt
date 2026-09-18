package dev.zyra.mobile.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics

// Desktop's box-drawing mark, drawn on a shared grid so Android font fallback
// and line metrics cannot separate its joins. Text scaling does not enlarge art.
private val wordmarkRows = listOf(
    "┏━━━┳┓ ┏┳━┳━━┓", "┣━━┃┃┃ ┃┃┏┫┏┓┃", "┃┃━━┫┗━┛┃┃┃┏┓┃",
    "┗━━━┻━┓┏┻┛┗┛┗┛", "    ┏━┛┃", "    ┗━━┛"
)
private val wordmarkWidth = wordmarkRows.maxOf { it.length } * 2f
private val wordmarkHeight = wordmarkRows.size * 3f
private val wordmarkPath = Path().apply {
    val connections = mapOf('━' to "LR", '┃' to "UD", '┏' to "RD", '┓' to "LD",
        '┗' to "RU", '┛' to "LU", '┣' to "URD", '┫' to "ULD", '┳' to "LRD", '┻' to "LRU")
    wordmarkRows.forEachIndexed { row, text ->
        text.forEachIndexed { column, glyph ->
            val x = column * 2f + 1f
            val y = row * 3f + 1.5f
            connections[glyph]?.forEach { direction ->
                moveTo(x, y)
                when (direction) {
                    'L' -> lineTo(x - 1f, y)
                    'R' -> lineTo(x + 1f, y)
                    'U' -> lineTo(x, y - 1.5f)
                    'D' -> lineTo(x, y + 1.5f)
                }
            }
        }
    }
}

@Composable internal fun ZyraWordmark(modifier: Modifier = Modifier) {
    val color = MaterialTheme.colorScheme.primary
    Canvas(modifier.aspectRatio(wordmarkWidth / wordmarkHeight).semantics { contentDescription = "Zyra" }) {
        scale(size.width / wordmarkWidth, size.height / wordmarkHeight, pivot = Offset.Zero) {
            drawPath(wordmarkPath, color, style = Stroke(width = .24f, cap = StrokeCap.Square))
        }
    }
}
