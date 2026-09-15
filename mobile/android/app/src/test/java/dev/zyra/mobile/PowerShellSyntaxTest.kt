package dev.zyra.mobile

import dev.zyra.mobile.data.*
import org.junit.Assert.*
import org.junit.Test

class PowerShellSyntaxTest {
    @Test fun launcherVariablesCommandsAndParametersAreVisible() {
        val source = "\$Root = Split-Path -Parent \$MyInvocation.MyCommand.Path\n\$Cli = Join-Path \$Root \"bin\\zyra.mjs\"\nnode \$Cli @args\nexit \$LASTEXITCODE"
        val tokens = CodeSyntax.tokens(source, "zyra.ps1")
        val parts = tokens.associate { source.substring(it.start, it.end) to it.kind }
        assertEquals(CodeTokenKind.PROPERTY, parts["\$Root"])
        assertEquals(CodeTokenKind.KEYWORD, parts["Split-Path"])
        assertEquals(CodeTokenKind.PROPERTY, parts["-Parent"])
        assertEquals(CodeTokenKind.PROPERTY, parts["@args"])
        assertEquals(CodeTokenKind.KEYWORD, parts["exit"])
    }
    @Test fun pathsQuotesCommentsAndHereStringsStayWhole() {
        val examples = listOf("'C:\\folder\\'", "'it''s literal'", "\"say `\"hello`\"\"", "@'\nnot 'the end'\n'@", "<# outer <# inner #> done #>")
        examples.forEach { source ->
            val tokens = CodeSyntax.tokens(source, "module.psm1")
            assertEquals(source, tokens.single().let { source.substring(it.start, it.end) })
        }
    }
    @Test fun incompleteAndLargeInputIsBounded() {
        listOf("<# unfinished", "@'\nunfinished", "\${missing", "\$value = 123;".repeat(20000)).forEach { source ->
            val tokens = CodeSyntax.tokens(source, "powershell")
            assertTrue(tokens.size <= 16000)
            assertTrue(tokens.all { it.start < it.end && it.end <= minOf(source.length, 131072) })
            assertTrue(tokens.zipWithNext().all { (a, b) -> a.end <= b.start })
        }
    }
}
