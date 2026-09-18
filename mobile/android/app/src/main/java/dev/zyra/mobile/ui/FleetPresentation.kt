package dev.zyra.mobile.ui

import java.util.Locale

/** Compact metadata from the PC; missing metrics remain absent. */
fun fleetRunMetadata(run: FleetRun): String = listOfNotNull(
    run.model.takeIf { it.isNotBlank() },
    run.totalTokens?.let { count ->
        (if (count >= 1000) String.format(Locale.ROOT, "%.1fk", count / 1000.0) else count.toString()) + " tokens"
    },
    run.elapsedMs?.let { millis ->
        val seconds = millis / 1000
        when {
            seconds >= 3600 -> "${seconds / 3600}h ${(seconds % 3600) / 60}m"
            seconds >= 60 -> "${seconds / 60}m ${seconds % 60}s"
            else -> "${seconds}s"
        }
    }
).joinToString(" · ")
