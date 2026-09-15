package dev.zyra.mobile
import dev.zyra.mobile.data.*
import org.junit.Assert.*
import org.junit.Test

class GitReviewTest {
    @Test fun combinedMergeDiffKeepsEveryParentColumnVisible() {
        val source="diff --cc file.txt\n@@@ -1 -1 +1,5 @@@\n++<<<<<<< HEAD\n +ours\n++=======\n+ theirs\n++>>>>>>> other"
        val rows=gitDiffRows(source);assertEquals(source,rows.joinToString("\n") {it.text});assertTrue(rows.all {it.before==null && it.after==null})
    }
    @Test fun hunkNumbersTrackAddedRemovedAndContextLines() {
        val rows=gitDiffRows("diff --git a/main.kt b/main.kt\n--- a/main.kt\n+++ b/main.kt\n@@ -10,2 +10,3 @@\n same\n-old\n+new\n+extra\n")
        assertEquals(6,rows.size)
        assertEquals(GitDiffRow("same",GitDiffKind.CONTEXT,10,10),rows[2])
        assertEquals(GitDiffRow("old",GitDiffKind.REMOVE,11,null),rows[3])
        assertEquals(GitDiffRow("extra",GitDiffKind.ADD,null,12),rows[5])
    }
    @Test fun fileHeadersAreNotCountedAsCodeAndBinaryChangesRemainVisible() {
        val rows=gitDiffRows("diff --git a/logo b/logo\nBinary files a/logo and b/logo differ\ndiff --git a/new b/new\n--- /dev/null\n+++ b/new\n@@ -0,0 +1 @@\n+++ code\n\\ No newline at end of file\n")
        assertTrue(rows.any {it.kind==GitDiffKind.NOTE && it.text.startsWith("Binary")})
        assertEquals(GitDiffRow("++ code",GitDiffKind.ADD,null,1),rows.first {it.kind==GitDiffKind.ADD})
    }
    @Test fun newFilesAreWorkingChangesAndRenamesRetainBothPaths() {
        val fresh=GitChange("new.txt","?","?");assertTrue(fresh.working);assertFalse(fresh.staged);assertEquals("New file",fresh.status(false))
        val renamed=GitChange("next.txt","R"," ","old.txt");assertTrue(renamed.staged);assertFalse(renamed.working);assertEquals("Renamed",renamed.status(true))
    }
}
