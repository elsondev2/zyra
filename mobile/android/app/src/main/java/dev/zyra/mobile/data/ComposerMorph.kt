package dev.zyra.mobile.data

/** Move controls below the field before widening it; reverse order when closing. */
object ComposerMorph {
    fun row(progress: Float) = (progress * 2f).coerceIn(0f, 1f)
    fun width(progress: Float) = (progress * 2f - 1f).coerceIn(0f, 1f)
}

object SheetDragPolicy {
    fun dismiss(distance: Float, velocity: Float, density: Float) = distance >= 88f * density || (distance >= 12f * density && velocity >= 1000f * density)
}
