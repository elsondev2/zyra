package dev.zyra.mobile
import dev.zyra.mobile.data.TextAttachmentPolicy
import org.junit.Assert.*
import org.junit.Test
class TextAttachmentPolicyTest {
    @Test fun acceptsSourceUnicodeAndWhitespace() { assertEquals("# Hi \u00e9\n\tthere", TextAttachmentPolicy.validate("README.MD", "# Hi \u00e9\n\tthere".toByteArray())) }
    @Test fun rejectsUnsupportedBinaryInvalidUtf8AndOversize() {
        listOf("file.pdf" to "%PDF".toByteArray(), "file.txt" to byteArrayOf(-1), "file.md" to byteArrayOf(0), "file.json" to ByteArray(180001) { 65 }).forEach { (name, bytes) ->
            try { TextAttachmentPolicy.validate(name, bytes); fail(name) } catch (_: IllegalArgumentException) { }
        }
    }
}
