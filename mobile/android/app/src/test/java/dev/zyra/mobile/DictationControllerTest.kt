package dev.zyra.mobile

import dev.zyra.mobile.dictation.*
import dev.zyra.mobile.voice.VoicePcm
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.advanceUntilIdle
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.util.Base64

@OptIn(ExperimentalCoroutinesApi::class)
class DictationControllerTest {
    private class Recorder(val bytes: ByteArray = VoicePcm.wav(listOf(ByteArray(48000)))) : DictationRecorder {
        val ready = CompletableDeferred<ByteArray>()
        override suspend fun record(level: (Int, Float) -> Unit): ByteArray { level(1000, .6f); return ready.await() }
        override fun stop() { ready.complete(bytes) }
    }
    private fun request(finish: suspend () -> String = { "Dictated words" }): DictationRequest = { method, params -> when(method) {
        "dictation.status" -> JSONObject().put("available",true).put("signedIn",true)
        "dictation.chunk" -> JSONObject().put("offset", params.getInt("offset") + Base64.getDecoder().decode(params.getString("data")).size)
        "dictation.finish" -> JSONObject().put("text",finish())
        else -> JSONObject()
    } }
    @Test fun insertsIntoTheLatestDraftWithoutSendingOrReplacingTyping() = runTest {
        val recorder=Recorder(); val controller=DictationController(this) {recorder}; var draft="Original"
        controller.start(request()) { text -> appendDictatedText(draft,text)?.let {draft=it;true} ?: false }
        controller.state.first {it.phase=="recording"}; draft="Edited while recording"; controller.finish()
        controller.state.first {it.phase=="idle"}
        assertEquals("Edited while recording Dictated words",draft); assertTrue(recorder.bytes.all {it==0.toByte()})
    }
    @Test fun unavailablePcNeverStartsMicrophone() = runTest {
        var starts=0; val controller=DictationController(this) {starts++; Recorder()}
        controller.start({_,_->JSONObject().put("available",true).put("signedIn",false).put("message","Connect on this PC")}) {fail("No draft insertion");true}
        assertEquals("Connect on this PC",controller.state.first {it.phase=="error"}.error); assertEquals(0,starts); controller.cancel()
    }
    @Test fun cancelDuringProviderWorkErasesRecordingAndDiscardsLateText() = runTest {
        val recorder=Recorder(); val held=CompletableDeferred<String>(); val started=CompletableDeferred<Unit>(); var inserts=0
        val controller=DictationController(this) {recorder}
        controller.start(request { started.complete(Unit); withContext(NonCancellable) {held.await()} }) {inserts++;true}
        controller.state.first {it.phase=="recording"}; controller.finish(); started.await(); controller.cancel(); held.complete("Late text"); advanceUntilIdle()
        assertEquals("idle",controller.state.value.phase); assertTrue(recorder.bytes.all {it==0.toByte()}); assertEquals(0,inserts)
    }
    @Test fun explicitRetryKeepsAudioButDoesNotRecordOrSendAgainAutomatically() = runTest {
        val recorder=Recorder(); var calls=0; var inserts=0; val controller=DictationController(this) {recorder}
        controller.start(request {calls++; if(calls==1) error("Computer temporarily unavailable"); "Recovered"}) {inserts++;true}
        controller.state.first {it.phase=="recording"}; controller.finish()
        val failed=controller.state.first {it.phase=="error"}; assertTrue(failed.retry); assertEquals(1,calls); assertEquals(0,inserts)
        controller.retry(); controller.state.first {it.phase=="idle"}; assertEquals(2,calls); assertEquals(1,inserts)
    }
    @Test fun fullDraftRetainsTranscriptForLocalInsertionWithoutAnotherProviderRequest() = runTest {
        val recorder=Recorder(); var calls=0; var draft="x".repeat(60000); val controller=DictationController(this) {recorder}
        controller.start(request {calls++;"Words"}) {text->appendDictatedText(draft,text)?.let {draft=it;true} ?: false}
        controller.state.first {it.phase=="recording"}; controller.finish(); assertTrue(controller.state.first {it.phase=="error"}.insert)
        assertEquals(60000,draft.length); draft="Shorter"; controller.retry(); controller.state.first {it.phase=="idle"}
        assertEquals("Shorter Words",draft);assertEquals(1,calls)
    }
    @Test fun tooShortRecordingCannotEnterAnUnusableRetryLoop() = runTest {
        val recorder=Recorder(ByteArray(44)); val controller=DictationController(this) {recorder}
        controller.start(request()) {fail("No insertion");true}; controller.state.first {it.phase=="recording"}; controller.finish()
        assertFalse(controller.state.first {it.phase=="error"}.retry); controller.cancel()
    }
    @Test fun mismatchedChunkAcknowledgementCancelsInsteadOfLosingOrDuplicatingAudio() = runTest {
        var cancelled=false
        try { uploadDictation(VoicePcm.wav(listOf(ByteArray(48000))), {method,_-> if(method=="dictation.chunk") JSONObject().put("offset",1) else {if(method=="dictation.cancel")cancelled=true;JSONObject()} }) {}; fail("Must reject wrong offset") }
        catch (_: IllegalStateException) { assertTrue(cancelled) }
    }
    @Test fun sameOwnerReconnectRetainsAudioForExplicitRetryWithANewConnection() = runTest {
        val recorder=Recorder(); var oldCalls=0; var newCalls=0; var inserted=""; val controller=DictationController(this) {recorder}
        controller.start(request {oldCalls++; error("Disconnected")}, "pc" to "chat") {inserted=it;true}
        controller.state.first {it.phase=="recording"}; controller.finish(); controller.state.first {it.phase=="error"}
        controller.rebind("pc" to "chat", request {newCalls++;"Recovered on reconnect"})
        assertEquals("error",controller.state.value.phase); assertEquals(0,newCalls)
        controller.retry(); controller.state.first {it.phase=="idle"}
        assertEquals(1,oldCalls); assertEquals(1,newCalls); assertEquals("Recovered on reconnect",inserted)
    }
    @Test fun rebindToAnotherChatDiscardsThePreviousRecording() = runTest {
        val recorder=Recorder(); var inserted=0; val controller=DictationController(this) {recorder}
        controller.start(request {error("Disconnected")}, "pc" to "chat") {inserted++;true}
        controller.state.first {it.phase=="recording"}; controller.finish(); controller.state.first {it.phase=="error"}
        controller.rebind("pc" to "another-chat",request()); assertEquals("idle",controller.state.value.phase)
        assertTrue(recorder.bytes.all {it==0.toByte()}); assertEquals(0,inserted)
    }
    @Test fun newRecordingWaitsForTheOldMicrophoneToRelease() = runTest {
        var active=0;var peak=0
        val controller=DictationController(this) { object:DictationRecorder {
            val stop=CompletableDeferred<Unit>()
            override suspend fun record(level:(Int,Float)->Unit):ByteArray {
                active++;peak=maxOf(peak,active)
                try {stop.await();return VoicePcm.wav(listOf(ByteArray(48000)))}
                finally {withContext(NonCancellable) {delay(50);active--}}
            }
            override fun stop() {stop.complete(Unit)}
        } }
        controller.start(request()) {true}; controller.state.first {it.phase=="recording"}; controller.cancel()
        controller.start(request()) {true}; controller.state.first {it.phase=="recording"}; controller.finish(); controller.state.first {it.phase=="idle"}
        assertEquals(1,peak);assertEquals(0,active)
    }
    @Test fun appendPreservesWhitespaceAndNeverTruncatesExistingText() {
        assertEquals("line\nWords",appendDictatedText("line\n"," Words "));assertEquals("Words",appendDictatedText(""," Words "))
        assertNull(appendDictatedText("x".repeat(60000),"Words"))
    }
}
