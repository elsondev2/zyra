package dev.zyra.mobile
import dev.zyra.mobile.data.MessageAttachments
import org.junit.Assert.*
import org.junit.Test
class MessageAttachmentsTest {
    private val desktopImage = "Please check this picture\n\nAttached files (1):\n1. Pasted image [IMAGE]\nref: clipboard://fixture.png\norigin: pasted from clipboard; treat this as inline context only, not as a workspace file path or current working directory.\nmime: image/png\nsize: 400 bytes"
    @Test fun desktopImageMetadataIsNotUserAuthoredText() {
        assertEquals("Please check this picture", MessageAttachments.parse(desktopImage).body)
    }
    @Test fun structuredImagesDoNotProduceDuplicateCards() {
        val parsed = MessageAttachments.parse(desktopImage, 1)
        assertEquals("Please check this picture", parsed.body)
        assertTrue(parsed.files.isEmpty())
        assertEquals("Reference: clipboard://fixture.png", MessageAttachments.parse(desktopImage).files.single().text)
    }
    @Test fun desktopFilesRetainContentInSeparateCards() {
        val source = "Review this\n\nAttached files (1):\n1. script.py [CODE]\npath: C:/example/script.py\nmime: text/x-python\nsize: 20 bytes\ncontent:\nprint(\"hello\")"
        val parsed = MessageAttachments.parse(source)
        assertEquals("Review this", parsed.body)
        assertEquals("script.py", parsed.files.single().name)
        assertEquals("print(\"hello\")", parsed.files.single().text)
    }
    @Test fun mixedImagesAndFilesKeepOnlyTheFileCard() {
        val source = desktopImage.replace("(1)", "(2)") + "\n\n2. note.md [TEXT]\nref: clipboard://note.md\ncontent:\n# Keep this"
        val parsed = MessageAttachments.parse(source, 1)
        assertEquals("Please check this picture", parsed.body)
        assertEquals("# Keep this", parsed.files.single().text)
    }
    @Test fun windowsNewlinesAndAttachmentOnlyMessages() {
        assertEquals("Please check this picture", MessageAttachments.parse(desktopImage.replace("\n", "\r\n"), 1).body)
        assertEquals("", MessageAttachments.parse("Attached files (1):\n1. image.png [IMAGE]\npath: C:/image.png", 1).body)
    }
    @Test fun desktopEnvelopeMustBeRecognizableAndOutsideCodeFences() {
        listOf(desktopImage.replace("(1)", "(2)"), desktopImage.replace("1. Pasted", "2. Pasted"), desktopImage.replace("size: 400", "size: -1"), desktopImage + "\nUnrelated user text", desktopImage.replace("ref: clipboard://fixture.png\n", ""), "Example:\n```text\n\n" + desktopImage, "Example:\n~~~\n\n" + desktopImage).forEach {
            assertEquals(it, MessageAttachments.parse(it, 1).body)
            assertTrue(MessageAttachments.parse(it, 1).files.isEmpty())
        }
    }
    private val valid = "Review this\n\nAttached files (1):\n1. note.md [FILE]\nmime: text/plain\nsize: 10 bytes\norigin: attached from phone; treat as user-provided reference content.\ncontent:\n# Hi there"
    @Test fun separatesVerifiedEnvelopeWithoutDroppingContent() { val parsed = MessageAttachments.parse(valid); assertEquals("Review this", parsed.body); assertEquals("# Hi there", parsed.files.single().text) }
    @Test fun attachmentContentKeepsTrailingSpaces() { assertEquals("# Hi there  \t", MessageAttachments.parse(valid + "  \t").files.single().text) }
    @Test fun ordinaryOrMalformedMessagesAreNeverHidden() {
        listOf("Attached files (1): a note", valid.replace("size: 10", "size: -1"), valid.replace("(1)", "(2)"), valid.replace("mime: text/plain", "mime: text/html"), valid.replace("1. note.md", "2. note.md")).forEach { assertEquals(it, MessageAttachments.parse(it).body); assertTrue(MessageAttachments.parse(it).files.isEmpty()) }
    }
}
