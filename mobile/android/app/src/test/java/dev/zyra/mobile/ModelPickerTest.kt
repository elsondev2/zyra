package dev.zyra.mobile

import dev.zyra.mobile.data.AvailableModel
import dev.zyra.mobile.ui.ModelPickerController
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ModelPickerTest {
    private val model = AvailableModel("openai/alpha", "Alpha", "", listOf("low", "high"), 100000)
    @Test fun reopeningUsesOnlyTheSameLiveConnectionWithinTwoMinutes() = runTest {
        var time = 0L; var loads = 0
        val pc = Any(); val picker = ModelPickerController(backgroundScope) { time }
        val load: suspend () -> List<AvailableModel> = { loads++; listOf(model) }
        picker.open(pc, load) { _, _ -> }; runCurrent()
        picker.close(); picker.open(pc, load) { _, _ -> }; runCurrent()
        assertEquals(1, loads)
        time = 120001
        picker.close(); picker.open(pc, load) { _, _ -> }; runCurrent()
        assertEquals(2, loads)
        picker.close(); picker.open(Any(), load) { _, _ -> }; runCurrent()
        assertEquals(3, loads)
    }
    @Test fun dismissedSlowResponseCannotReopenOrPoisonAnotherPcCatalog() = runTest {
        val slow = CompletableDeferred<List<AvailableModel>>()
        val picker = ModelPickerController(backgroundScope)
        picker.open(Any(), { withContext(NonCancellable) { slow.await() } }) { _, _ -> }; runCurrent()
        picker.close()
        val pc = Any()
        picker.open(pc, { listOf(model.copy(id = "other", label = "Other")) }) { _, _ -> }; runCurrent()
        slow.complete(listOf(model)); runCurrent()
        assertEquals("other", picker.state.value.models.single().id)
        picker.close(); picker.open(pc, { error("Should use this PC's cache") }) { _, _ -> }; runCurrent()
        assertEquals("other", picker.state.value.models.single().id)
    }
    @Test fun reusingCatalogStillTargetsTheNewChatAndNeverGuessesThinkingLevels() = runTest {
        val picker = ModelPickerController(backgroundScope); val pc = Any()
        val requests = mutableListOf<String>()
        picker.open(pc, { listOf(model) }) { field, value -> requests.add("old:$field:$value") }; runCurrent()
        picker.close()
        picker.open(pc, { error("Cached") }) { field, value -> requests.add("new:$field:$value") }
        picker.thinking(model.id, "ultra"); runCurrent(); assertTrue(requests.isEmpty())
        picker.thinking(model.id, "high"); runCurrent()
        assertTrue(picker.state.value.visible)
        picker.select(model.id); runCurrent()
        assertEquals(listOf("new:thinking:high", "new:model:openai/alpha"), requests)
        assertFalse(picker.state.value.visible)
    }
    @Test fun failedSelectionStaysOpenAndAllowsRetryWithoutDuplicateRequests() = runTest {
        val picker = ModelPickerController(backgroundScope); var requests = 0
        picker.open(Any(), { listOf(model) }) { _, _ -> requests++; if (requests == 1) error("PC is reconnecting") }; runCurrent()
        picker.select(model.id); picker.select(model.id); runCurrent()
        assertEquals(1, requests); assertTrue(picker.state.value.visible)
        assertEquals("PC is reconnecting", picker.state.value.error)
        assertNull(picker.state.value.applying)
        picker.select(model.id); runCurrent(); assertEquals(2, requests); assertFalse(picker.state.value.visible)
    }
    @Test fun closingWhileApplyingCannotDismissAReplacementSheet() = runTest {
        val slow = CompletableDeferred<Unit>(); val picker = ModelPickerController(backgroundScope)
        picker.open(Any(), { listOf(model) }) { _, _ -> withContext(NonCancellable) { slow.await() } }; runCurrent()
        picker.select(model.id); runCurrent(); picker.close()
        picker.open(Any(), { listOf(model.copy(id = "next")) }) { _, _ -> }; runCurrent()
        slow.complete(Unit); runCurrent()
        assertTrue(picker.state.value.visible); assertEquals("next", picker.state.value.models.single().id)
        assertNull(picker.state.value.applying)
    }
    @Test fun failedCatalogShowsRecoveryAndForgetDropsCachedModels() = runTest {
        val picker = ModelPickerController(backgroundScope); val pc = Any()
        picker.open(pc, { error("Offline") }) { _, _ -> }; runCurrent()
        assertEquals("Offline", picker.state.value.error); assertFalse(picker.state.value.loading)
        picker.open(pc, { listOf(model) }) { _, _ -> }; runCurrent()
        picker.close(clearCache = true)
        picker.open(pc, { listOf(model.copy(id = "new")) }) { _, _ -> }; runCurrent()
        assertEquals("new", picker.state.value.models.single().id)
    }
    @Test fun fullPageSelectionKeepsTheCatalogAndThinkingControlsAvailable() = runTest {
        val picker = ModelPickerController(backgroundScope)
        val requests = mutableListOf<String>()
        picker.open(Any(), { listOf(model) }) { field, value -> requests.add("$field:$value") }; runCurrent()
        picker.selectInline(model.id); runCurrent()
        assertTrue(picker.state.value.visible)
        assertEquals(listOf(model), picker.state.value.models)
        picker.thinking(model.id, "high"); runCurrent()
        assertEquals(listOf("model:openai/alpha", "thinking:high"), requests)
        assertNull(picker.state.value.applying)
    }
    @Test fun prefetchAndRepeatedOpeningShareOneSlowRequest() = runTest {
        val picker = ModelPickerController(backgroundScope)
        val pc = Any(); var loads = 0
        val response = CompletableDeferred<List<AvailableModel>>()
        val load: suspend () -> List<AvailableModel> = { loads++; response.await() }
        picker.prefetch(pc, load); runCurrent()
        repeat(10) { picker.open(pc, load) { _, _ -> }; runCurrent(); picker.close() }
        assertEquals(1, loads)
        response.complete(listOf(model)); runCurrent()
        picker.open(pc, load) { _, _ -> }
        assertEquals(listOf(model), picker.state.value.models)
        assertFalse(picker.state.value.loading)
        runCurrent(); assertEquals(1, loads)
    }
    @Test fun expiredCatalogStaysVisibleWhileRevalidating() = runTest {
        var time = 0L
        val picker = ModelPickerController(backgroundScope) { time }; val pc = Any()
        picker.open(pc, { listOf(model) }) { _, _ -> }; runCurrent(); picker.close()
        time = 120001
        val response = CompletableDeferred<List<AvailableModel>>()
        picker.open(pc, { response.await() }) { _, _ -> }; runCurrent()
        assertFalse(picker.state.value.loading)
        assertEquals(listOf(model), picker.state.value.models)
        response.complete(listOf(model.copy(label = "Updated"))); runCurrent()
        assertEquals("Updated", picker.state.value.models.single().label)
    }
    @Test fun failedPrefetchDoesNotCancelSessionOrBlockRetry() = runTest {
        val picker = ModelPickerController(backgroundScope); val pc = Any()
        picker.prefetch(pc) { error("Offline") }; runCurrent()
        assertTrue(backgroundScope.isActive)
        assertFalse(picker.state.value.visible)
        picker.open(pc, { listOf(model) }) { _, _ -> }; runCurrent()
        assertNull(picker.state.value.error)
        assertEquals(listOf(model), picker.state.value.models)
    }
    @Test fun invalidatingConnectionCancelsPendingCatalog() = runTest {
        val picker = ModelPickerController(backgroundScope); val pc = Any()
        val response = CompletableDeferred<List<AvailableModel>>()
        picker.prefetch(pc) { response.await() }; runCurrent()
        picker.close(clearCache = true)
        picker.open(pc, { listOf(model.copy(id = "new")) }) { _, _ -> }; runCurrent()
        response.complete(listOf(model)); runCurrent()
        assertEquals("new", picker.state.value.models.single().id)
    }
}

