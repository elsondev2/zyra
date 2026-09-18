package dev.zyra.mobile

import dev.zyra.mobile.data.MarkdownLinks
import org.junit.Assert.*
import org.junit.Test

class MarkdownLinksTest {
    @Test fun projectLinksAcceptDesktopPathsButNeverExternalSchemes() {
        listOf("src/code.kt:4", "C:/work/code.kt:4", "C:\\work\\code.kt", "file:///C:/work/code.kt#L4", "/work/code.kt", "hello%20world.md").forEach { assertTrue(it, MarkdownLinks.isProjectFile(it)) }
        listOf("https://example.com", "javascript:alert(1)", "data:text/html,hi", "mailto:user@example.com", "#heading", "//remote/share", "\\\\remote\\share", "", "x\u0000y").forEach { assertFalse(it, MarkdownLinks.isProjectFile(it)) }
    }
}
