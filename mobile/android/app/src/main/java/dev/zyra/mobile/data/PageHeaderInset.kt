package dev.zyra.mobile.data

/** Keep outgoing page geometry stable while the active page follows real layout measurements. */
class PageHeaderInset {
    private var last = 0f
    fun resolve(active: Boolean, measured: Float): Float {
        if (active) last = measured.coerceAtLeast(0f)
        return last
    }
}
