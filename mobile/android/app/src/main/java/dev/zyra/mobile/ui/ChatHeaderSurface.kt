package dev.zyra.mobile.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.unit.dp

/** Opaque under the controls, feathered into the scrolling conversation below. */
@Composable fun ChatHeaderSurface(floating: Boolean, content: @Composable () -> Unit) {
    val background = MaterialTheme.colorScheme.background
    Box(Modifier.fillMaxWidth().then(if (floating) Modifier.drawWithCache {
        val end = size.height + 28.dp.toPx()
        val fade = Brush.verticalGradient(0f to background, (size.height / end) to background, 1f to background.copy(alpha = 0f), endY = end)
        onDrawBehind { drawRect(fade, size = Size(size.width, end)) }
    } else Modifier)) { content() }
}
