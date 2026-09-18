package dev.zyra.mobile
import dev.zyra.mobile.data.Pairing
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.util.Base64

class PairingTest {
    private fun code(url: String = "https://192.168.1.2:47321", expires: Long = 121000): String {
        val json = JSONObject().put("v", 1).put("hostId", "host").put("name", "PC").put("url", url)
            .put("fingerprint", "a".repeat(64)).put("secret", "b".repeat(43)).put("expiresAt", expires)
        return "zyra://pair#" + Base64.getUrlEncoder().withoutPadding().encodeToString(json.toString().toByteArray())
    }
    @Test fun acceptsPinnedLanPairing() { assertEquals("PC", Pairing.parse(code(), 1000).name) }
    @Test fun rejectsCleartextAndEmbeddedCredentials() {
        assertThrows(IllegalArgumentException::class.java) { Pairing.parse(code("http://192.168.1.2"), 1000) }
        assertThrows(IllegalArgumentException::class.java) { Pairing.parse(code("https://user:password@192.168.1.2"), 1000) }
    }
    @Test fun rejectsExpiredOrUnboundedCodes() {
        assertThrows(IllegalArgumentException::class.java) { Pairing.parse(code(expires = 1000), 1000) }
        assertThrows(IllegalArgumentException::class.java) { Pairing.parse(code(expires = Long.MAX_VALUE), 1000) }
        assertThrows(IllegalArgumentException::class.java) { Pairing.parse("x".repeat(5000), 1000) }
    }
}
