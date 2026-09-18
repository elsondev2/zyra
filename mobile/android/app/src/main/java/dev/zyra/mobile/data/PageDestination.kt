package dev.zyra.mobile.data

/** Direction is navigation intent, not a guessed hierarchy of screen names. */
data class PageDestination(val route: String, val back: Boolean = false) {
    fun enterOffset(width: Int) = if (back) -width / 12 else width / 12
    fun exitOffset(width: Int) = -enterOffset(width)
}

fun startupPage(hasPairedMachines: Boolean) = if (hasPairedMachines) "chats" else "machines"
