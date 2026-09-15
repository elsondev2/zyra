package dev.zyra.mobile.network

import kotlinx.coroutines.delay
import org.json.JSONObject

object CatalogMetadataHydration {
    suspend fun refresh(initial: JSONObject, current: () -> Boolean, request: suspend () -> JSONObject, update: (JSONObject) -> Unit) {
        var page = initial
        repeat(3) {
            if (!page.optBoolean("metadataPending") || !current()) return
            delay(page.optLong("metadataRetryMs", 750).coerceIn(250, 2000))
            if (!current()) return
            page = request()
            if (!current()) return
            update(page)
        }
    }
}
