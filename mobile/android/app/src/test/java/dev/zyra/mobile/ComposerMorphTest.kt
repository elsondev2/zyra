package dev.zyra.mobile

import dev.zyra.mobile.data.ComposerMorph
import dev.zyra.mobile.data.SheetDragPolicy
import org.junit.Assert.*
import org.junit.Test

class ComposerMorphTest {
    @Test fun morphNeverWidensTextIntoControlsAcrossOpeningAndClosingFrames() {
        for (available in listOf(256f, 288f, 380f)) for (trailing in listOf(88f, 132f)) for (textHeight in listOf(44f, 72f, 122f)) for (frame in 0..100) {
            val progress = frame / 100f
            val row = ComposerMorph.row(progress); val width = ComposerMorph.width(progress)
            val textLeft = 44f + (10f - 44f) * width
            val textWidth = available - 44f - trailing + (44f + trailing - 20f) * width
            val textTop = (maxOf(textHeight, 44f) - textHeight) / 2 * (1 - row)
            val controlTop = (maxOf(textHeight, 44f) - 44f) / 2 * (1 - row) + textHeight * row
            val overlapsVertically = textTop < controlTop + 44 && textTop + textHeight > controlTop + .01f
            if (overlapsVertically) { assertTrue(textLeft >= 44f - .01f); assertTrue(textLeft + textWidth <= available - trailing + .01f) }
        }
    }
    @Test fun headerDismissRequiresIntentionalDownwardDistanceOrVelocityAtAnyDensity() {
        for (density in listOf(1f, 2f, 3.5f)) {
            assertFalse(SheetDragPolicy.dismiss(5f * density, 2000f * density, density))
            assertFalse(SheetDragPolicy.dismiss(50f * density, -2000f * density, density))
            assertTrue(SheetDragPolicy.dismiss(90f * density, 0f, density))
            assertTrue(SheetDragPolicy.dismiss(20f * density, 1200f * density, density))
        }
    }
}
