package dev.zyra.mobile

import dev.zyra.mobile.data.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class CapturedEditTimelineTest {
    @Test fun `edit evidence survives live completion cached restore and paged history`() {
        val patch = "--- app.kt\n+++ app.kt\n@@ -1 +1 @@\n-old\n+new\n"
        val message = JSONObject().put("role", "toolResult").put("toolName", "edit").put("toolCallId", "edit-one")
            .put("content", JSONArray().put(JSONObject().put("type", "text").put("text", "Successfully replaced 1 block(s).")))
            .put("details", JSONObject().put("patch", patch))
        fun event(sequence: Int, value: JSONObject) = JSONObject().put("sequence", sequence).put("event", value)
        var live = TimelineReducer.apply(SessionView(), event(1, JSONObject().put("type", "tool_execution_start")
            .put("toolCallId", "edit-one").put("toolName", "edit").put("args", JSONObject().put("path", "app.kt"))))
        live = TimelineReducer.apply(live, event(2, JSONObject().put("type", "tool_execution_end").put("toolCallId", "edit-one").put("result", message)))
        assertEquals(patch, capturedEdit(live.items.single().raw)!!.text)
        live = TimelineReducer.apply(live, event(3, JSONObject().put("type", "message_end").put("message", message)))
        val cached = TimelineReducer.decode(TimelineReducer.encode(live))
        assertEquals(patch, capturedEdit(cached.items.single().raw)!!.text)
        val history = TimelineReducer.history("chat", JSONObject().put("entries", JSONArray().put(JSONObject().put("type", "message").put("message", message))))
        assertEquals(patch, capturedEdit(history.items.single().raw)!!.text)
        assertEquals("edit", WorkActions.project(cached.items.single()).family)
    }
}
