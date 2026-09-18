package dev.zyra.mobile.ui

/** Only visible tiles and one small prefetch margin may own a thumbnail transfer. */
internal fun imageNearViewport(x: Float, y: Float, width: Float, height: Float, viewportX: Float, viewportY: Float, viewportWidth: Float, viewportHeight: Float, margin: Float): Boolean =
    width > 0 && height > 0 && viewportWidth > 0 && viewportHeight > 0 &&
        y + height >= viewportY - margin && y <= viewportY + viewportHeight + margin &&
        x + width >= viewportX && x <= viewportX + viewportWidth
