package dev.zyra.mobile

import dev.zyra.mobile.data.*
import org.junit.Assert.*
import org.junit.Test

class TimelineProjectionCacheTest {
    private val user=TimelineItem("user","user","Review")
    private val result=TimelineItem("tool:read","tool","read\nCaptured file","tool")
    private fun call(path:String) = TimelineItem("call","assistant","",raw="""{"message":{"content":[{"type":"toolCall","name":"read","id":"read","arguments":{"path":"$path"}}]}}""",toolNames=listOf("read"))
    private fun project(projector:TimelineWork,items:List<TimelineItem>,chat:String="chat") = projector.rows(SessionView(chat,items=items,running=true)).filterIsInstance<ChatRailRow.Work>().flatMap { it.actions }.single()
    @Test fun `text deltas reuse unchanged captured action projections`() {
        val projector=TimelineWork();val base=listOf(user,call("a.kt"),result)
        val first=project(projector,base+TimelineItem("stream","assistant","Starting","stream"))
        val next=project(projector,base+TimelineItem("stream","assistant","Starting the next step","stream"))
        assertSame(first,next);assertEquals("Reading a.kt",next.title)
    }
    @Test fun `changed arguments or captured output invalidate only their action`() {
        val projector=TimelineWork();val first=project(projector,listOf(user,call("a.kt"),result))
        val renamed=project(projector,listOf(user,call("b.kt"),result));assertNotSame(first,renamed);assertEquals("Reading b.kt",renamed.title)
        val updated=project(projector,listOf(user,call("b.kt"),result.copy(text="read\nUpdated capture")))
        assertEquals("Updated capture",updated.output);assertNotSame(renamed,updated)
    }
    @Test fun `loading an earlier batch declaration changes the visible action group`() {
        val projector=TimelineWork();val entries=listOf(user,call("a.kt"),result);val first=project(projector,entries)
        val batch=TimelineItem("batch","assistant","",raw="""{"message":{"content":[{"type":"toolCall","name":"begin_action_batch","id":"batch","arguments":{"title":"Check navigation"}}]}}""",toolNames=listOf("begin_action_batch"))
        val next=project(projector,listOf(user,batch)+entries.drop(1));assertNull(first.batch);assertEquals("Check navigation",next.batch);assertNotSame(first,next)
    }
    @Test fun `evicted history and another chat cannot retain action projections`() {
        val projector=TimelineWork();val entries=listOf(user,call("a.kt"),result);val first=project(projector,entries)
        projector.rows(SessionView("chat"));val loaded=project(projector,entries);assertNotSame(first,loaded)
        val another=project(projector,entries,"another-chat");assertNotSame(loaded,another)
        assertEquals(loaded.title,another.title)
    }
    @Test fun `tools with omitted arguments still reuse projections across deltas`() {
        val projector=TimelineWork();val noArgs=TimelineItem("call","assistant","",raw="""{"message":{"content":[{"type":"toolCall","name":"status","id":"read"}]}}""",toolNames=listOf("status"))
        val entries=listOf(user,noArgs,result);val first=project(projector,entries)
        assertSame(first,project(projector,entries+TimelineItem("stream","assistant","Continuing","stream")))
    }
}
