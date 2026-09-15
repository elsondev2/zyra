package dev.zyra.mobile.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.runtime.getValue
import kotlin.math.roundToInt
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.data.ComposerMorph

/** Keep the text field mounted as its width changes, preserving focus and IME composition. */
@Composable fun ComposerInputLayout(expanded: Boolean, leading: @Composable () -> Unit, input: @Composable () -> Unit, trailing: @Composable () -> Unit) {
    val progress by animateFloatAsState(if (expanded) 1f else 0f, tween(if (LocalReduceMotion.current) 0 else 180), label = "Input expansion")
    Layout(content = { Box { leading() }; Box { input() }; Box { trailing() } },
        modifier = Modifier.fillMaxWidth().padding(4.dp)) { children, constraints ->
        val rowProgress = ComposerMorph.row(progress)
        val widthProgress = ComposerMorph.width(progress)
        val loose = constraints.copy(minWidth = 0, minHeight = 0)
        val leadingPlace = children[0].measure(loose)
        val trailingPlace = children[2].measure(loose)
        val inset = 10.dp.roundToPx()
        val compactWidth = constraints.maxWidth - leadingPlace.width - trailingPlace.width
        val textWidth = (compactWidth + (constraints.maxWidth - inset * 2 - compactWidth) * widthProgress).roundToInt().coerceAtLeast(1)
        val textPlace = children[1].measure(loose.copy(minWidth = textWidth, maxWidth = textWidth))
        val controlsHeight = maxOf(leadingPlace.height, trailingPlace.height)
        val compactHeight = maxOf(textPlace.height, controlsHeight)
        val height = (compactHeight + (textPlace.height + controlsHeight - compactHeight) * rowProgress).roundToInt()
        layout(constraints.maxWidth, height) {
            val controlY = (((compactHeight - controlsHeight) / 2f) * (1f - rowProgress) + textPlace.height * rowProgress).roundToInt()
            leadingPlace.placeRelative(0, controlY + (controlsHeight - leadingPlace.height) / 2)
            trailingPlace.placeRelative(constraints.maxWidth - trailingPlace.width, controlY + (controlsHeight - trailingPlace.height) / 2)
            textPlace.placeRelative((leadingPlace.width + (inset - leadingPlace.width) * widthProgress).roundToInt(), ((compactHeight - textPlace.height) / 2f * (1f - rowProgress)).roundToInt())
        }
    }
}
