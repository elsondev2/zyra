package dev.zyra.mobile.network
import org.json.JSONObject
import java.io.ByteArrayOutputStream
object BodyTransfer {
    suspend fun resolve(connection: HostConnection, result: JSONObject): JSONObject {
        val ref = result.optJSONObject("deferred") ?: return result
        check(!ref.optBoolean("unavailable")) { ref.optString("reason", "Open this output on the PC.") }
        val total = ref.getInt("bytes"); require(total in 0..(2 * 1024 * 1024)) { "This output is large. Open it on the PC." }
        val bytes = ByteArrayOutputStream(total)
        var offset = 0
        while (offset < total) {
            val chunk = connection.request("body.chunk", JSONObject().put("id", ref.getString("bodyId")).put("offset", offset))
            val decoded = java.util.Base64.getDecoder().decode(chunk.getString("base64"))
            val next = chunk.getInt("next")
            require(next > offset && next <= total && next - offset == decoded.size) { "Output transfer was interrupted." }
            bytes.write(decoded); offset = next
        }
        return JSONObject(bytes.toString("UTF-8"))
    }
}
