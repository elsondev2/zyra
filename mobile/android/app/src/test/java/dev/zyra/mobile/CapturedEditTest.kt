package dev.zyra.mobile

import dev.zyra.mobile.data.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class CapturedEditTest {
    private val patch = "--- app.ts\n+++ app.ts\n@@ -1 +1 @@\n-old\n+new  \n"
    private fun result() = JSONObject().put("content", "Successfully replaced 1 block(s) in app.ts.")
        .put("details", JSONObject().put("patch", patch).put("diff", "-1 old\n+1 new  "))

    @Test fun `live and stored result show recorded patch rather than success prose`() {
        for (key in listOf("result", "partialResult", "message")) {
            val evidence = capturedEdit(JSONObject().put(key, result()).toString())!!
            assertEquals(key, patch, evidence.text)
            assertTrue(key, evidence.unified)
        }
        assertEquals(patch, capturedEdit(result().toString())!!.text)
    }

    @Test fun `legacy numbered diffs preserve whitespace`() {
        val diff = " 8 context\n-9 old\n+9 new  \n"
        val raw = JSONObject().put("message", JSONObject().put("details", JSONObject().put("diff", diff)))
        assertEquals(diff, capturedEdit(raw.toString())!!.text)
        assertFalse(capturedEdit(raw.toString())!!.unified)
    }

    @Test fun `legacy edits use actual stored line numbers and preserve changed text`() {
        val rows = capturedEditRows(CapturedEdit(" 8 context\n-9 old\n+9 new  \n ...", false))
        assertEquals(listOf(GitDiffKind.CONTEXT, GitDiffKind.REMOVE, GitDiffKind.ADD, GitDiffKind.NOTE), rows.map { it.kind })
        assertEquals(9, rows[1].before)
        assertEquals(9, rows[2].after)
        assertEquals("new  ", rows[2].text)
        assertEquals(" ...", rows.last().text)
    }

    @Test fun `unified patch shares the existing review diff parser`() {
        val rows = capturedEditRows(CapturedEdit(patch, true))
        assertEquals(listOf("old", "new  "), rows.filter { it.kind in setOf(GitDiffKind.REMOVE, GitDiffKind.ADD) }.map { it.text })
    }

    @Test fun `missing captured results never pretend intended edits were applied`() {
        assertNull(capturedEdit("""{"args":{"oldText":"old","newText":"new"},"result":{"content":"Edit failed"}}"""))
        assertNull(capturedEdit("""{"result":{"details":{"patch":null,"diff":""}}}"""))
        assertNull(capturedEdit("broken"))
    }
}
