package dev.zyra.mobile

import dev.zyra.mobile.data.*
import dev.zyra.mobile.ui.workspaceCrumbs
import org.junit.Assert.*
import org.junit.Test
import org.json.JSONObject
import java.io.File

class FilePresentationTest {
    @Test fun desktopIconsRespectFilenameCompoundExtensionLightAndZyraFolders() {
        val icons = DesktopFileIcons(JSONObject(File("src/main/assets/desktop-file-icons.json").readText()))
        assertEquals("nodejs.svg", icons.resolve("project/package.json"))
        assertEquals("typescript-def.svg", icons.resolve("lib/component.d.ts"))
        assertEquals("folder-app.svg", icons.resolve(".zyra", directory = true))
        assertEquals("folder-git-open.svg", icons.resolve(".zyra-worktrees", directory = true, expanded = true))
        assertEquals("robot.svg", icons.resolve("agent.zyra"))
        assertEquals(icons.resolve("App.tsx"), icons.resolve("C:\\project\\APP.TSX"))
        assertNotEquals(icons.resolve("vercel.json"), icons.resolve("vercel.json", light = true))
    }
    @Test fun crumbsKeepFullNavigationPathsWithoutMachinePaths() {
        assertEquals(listOf("", "src", "src/main", "src/main/kotlin"), workspaceCrumbs("src/main/kotlin").map { it.path })
        assertEquals(listOf("Files", "src", "main", "kotlin"), workspaceCrumbs("src/main/kotlin").map { it.label })
        assertEquals(1, workspaceCrumbs("").size)
    }
    @Test fun highlightingKeepsCommentsStringsAndEscapesIntact() {
        val source = "const greeting = \"hello \\\"world\\\"\"; // return 12\nreturn 42"
        val tokens = CodeSyntax.tokens(source, "file.ts")
        assertEquals(listOf("const", "\"hello \\\"world\\\"\"", "// return 12", "return", "42"), tokens.map { source.substring(it.start, it.end) })
        assertEquals(listOf(CodeTokenKind.KEYWORD, CodeTokenKind.STRING, CodeTokenKind.COMMENT, CodeTokenKind.KEYWORD, CodeTokenKind.NUMBER), tokens.map { it.kind })
    }
    @Test fun jsonPropertiesAndUnknownLanguagesDoNotRewriteText() {
        val source = "{\"value\": \"true\", \"enabled\": true}"
        val tokens = CodeSyntax.tokens(source, "package.json")
        assertEquals(listOf(CodeTokenKind.PROPERTY, CodeTokenKind.STRING, CodeTokenKind.PROPERTY, CodeTokenKind.KEYWORD), tokens.map { it.kind })
        assertTrue(CodeSyntax.tokens("ordinary words 42", "notes.txt").isEmpty())
    }
    @Test fun unfinishedAndLargeFilesHaveBoundedValidTokenOffsets() {
        listOf("\"unfinished", "/* unfinished", "x = \"\"\"multiline\ntext\"\"\"", "const x = 1;".repeat(15000)).forEach { source ->
            val tokens = CodeSyntax.tokens(source, "sample.kt")
            assertTrue(tokens.size <= 16000)
            assertTrue(tokens.all { it.start >= 0 && it.start < it.end && it.end <= minOf(131072, source.length) })
            assertTrue(tokens.zipWithNext().all { (a, b) -> a.end <= b.start })
        }
    }
}
