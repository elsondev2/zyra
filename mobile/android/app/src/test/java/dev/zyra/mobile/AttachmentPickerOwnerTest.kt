package dev.zyra.mobile

import dev.zyra.mobile.data.AttachmentPickerOwner
import org.junit.Assert.*
import org.junit.Test

class AttachmentPickerOwnerTest {
    private val owner = AttachmentPickerOwner(7, 4, "pc", "chat")
    @Test fun `same chat return accepts selected photos`() { assertTrue(owner.accepts(7,4,"pc","chat","chat",false)) }
    @Test fun `new machine or chat rejects selected photos`() {
        assertFalse(owner.accepts(7,4,"other","chat","chat",false))
        assertFalse(owner.accepts(7,4,"pc","other","chat",false))
    }
    @Test fun `navigation away and back rejects stale picker even for same chat`() {
        assertFalse(owner.accepts(8,4,"pc","chat","chat",false))
        assertFalse(owner.accepts(7,5,"pc","chat","chat",false))
    }
    @Test fun `non chat page or pending hydration rejects selected photos`() {
        assertFalse(owner.accepts(7,4,"pc","chat","workspace",false))
        assertFalse(owner.accepts(7,4,"pc","chat","chat",true))
        assertFalse(owner.accepts(7,4,null,"chat","chat",false))
    }
}
