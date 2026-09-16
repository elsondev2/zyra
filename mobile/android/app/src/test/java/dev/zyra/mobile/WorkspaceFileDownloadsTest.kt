package dev.zyra.mobile

import dev.zyra.mobile.data.WorkspaceFileDownloads
import dev.zyra.mobile.data.FileTransferPacing
import dev.zyra.mobile.ui.*
import kotlinx.coroutines.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files
import java.util.Base64
import java.security.MessageDigest

class WorkspaceFileDownloadsTest {
    private fun metadata(bytes: ByteArray, etag: String = "stable") = JSONObject().put("size",bytes.size).put("etag",etag)
        .put("hash",MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(""){"%02x".format(it)})
    @Test fun boundedChunksProduceVerifiedFileAndReuseSameOwnerCache() = runBlocking {
        val root = Files.createTempDirectory("file-downloads").toFile()
        try {
            val bytes = ByteArray(100000) { (it % 128).toByte() }; var calls = 0
            val download = WorkspaceFileDownloads(root)
            val request: suspend (String,JSONObject)->JSONObject = { method, input ->
                assertEquals("workspace.file.chunk",method); calls++
                val offset=input.getInt("offset"); val length=input.getInt("length"); assertTrue(length in 8192..49152)
                val next=(offset+length).coerceAtMost(bytes.size)
                JSONObject().put("base64",Base64.getEncoder().encodeToString(bytes.copyOfRange(offset,next))).put("next",next).put("total",bytes.size).put("etag","stable")
            }
            val file=download.load("pc:chat", "src/sample.bin", metadata(bytes),request){_,_,_->}
            assertArrayEquals(bytes,file.readBytes()); assertEquals("sample.bin",file.name)
            val first=calls; download.load("pc:chat","src/sample.bin",metadata(bytes),request){_,_,_->}; assertEquals(first,calls)
            file.writeBytes(ByteArray(bytes.size))
            download.load("pc:chat","src/sample.bin",metadata(bytes),request){_,_,_->}; assertTrue(calls > first); assertArrayEquals(bytes,file.readBytes())
            assertEquals("R\u00e9sum\u00e9.pdf", download.load("pc:chat","R\u00e9sum\u00e9.pdf",metadata(bytes),request){_,_,_->}.name)
            download.load("other-pc:chat","src/sample.bin",metadata(bytes),request){_,_,_->}; assertTrue(calls>first)
        } finally { root.deleteRecursively() }
    }
    @Test fun malformedChunkCannotPublishPartialOrEscapeCache() = runBlocking {
        val root=Files.createTempDirectory("file-downloads").toFile()
        try {
            val download=WorkspaceFileDownloads(root)
            val failure=runCatching { download.load("pc","../..",metadata(byteArrayOf(1)),{_,_->JSONObject().put("base64","AQ==").put("next",2).put("total",1).put("etag","stable")}){_,_,_->} }
            assertTrue(failure.isFailure); assertTrue(root.listFiles().isNullOrEmpty())
            val capped=runCatching { download.load("pc","big",JSONObject().put("size",WorkspaceFileDownloads.MAX_BYTES+1).put("etag","x"),{_,_->error("Must not request")}){_,_,_->} }
            assertTrue(capped.isFailure)
        } finally { root.deleteRecursively() }
    }
    @Test fun observedPacingStaysBounded() {
        val pacing=FileTransferPacing(); pacing.received(16384,10_000_000_000); assertEquals(8192,pacing.chunkBytes)
        repeat(8) { pacing.received(49152,1_000_000) }; assertEquals(49152,pacing.chunkBytes); assertTrue(pacing.bytesPerSecond>0)
    }
    @Test fun interruptedHashedFileResumesAndCorruptPrefixCannotPublish() = runBlocking {
        val root = Files.createTempDirectory("file-resume").toFile()
        try {
            val bytes = ByteArray(50000) { (it % 123).toByte() }; val download = WorkspaceFileDownloads(root)
            var interrupt = true; val offsets = mutableListOf<Int>()
            val request: suspend (String, JSONObject) -> JSONObject = { _, input ->
                val offset = input.getInt("offset"); offsets.add(offset)
                if (interrupt && offset > 0) throw java.io.IOException("Connection lost")
                val next = (offset + input.getInt("length")).coerceAtMost(bytes.size)
                JSONObject().put("base64", Base64.getEncoder().encodeToString(bytes.copyOfRange(offset, next)))
                    .put("next", next).put("total", bytes.size).put("etag", "stable")
            }
            assertTrue(runCatching { download.load("pc", "resume.txt", metadata(bytes), request) { _, _, _ -> } }.isFailure)
            val partial = root.listFiles()!!.single().resolve(".incoming"); assertEquals(16384L, partial.length())
            interrupt = false; offsets.clear()
            val completed = download.load("pc", "resume.txt", metadata(bytes), request) { _, _, _ -> }
            assertEquals(16384, offsets.first()); assertArrayEquals(bytes, completed.readBytes())
            completed.delete(); interrupt = true
            assertTrue(runCatching { download.load("pc", "resume.txt", metadata(bytes), request) { _, _, _ -> } }.isFailure)
            partial.writeBytes(ByteArray(16384)); interrupt = false
            assertTrue(runCatching { download.load("pc", "resume.txt", metadata(bytes), request) { _, _, _ -> } }.isFailure)
            assertTrue(root.listFiles().isNullOrEmpty())
        } finally { root.deleteRecursively() }
    }
    @Test fun fileNavigationRejectsLateTransferAndMoveReopensDestination() = runBlocking {
        val root=Files.createTempDirectory("file-downloads").toFile()
        val scope=CoroutineScope(SupervisorJob()+Dispatchers.Unconfined)
        try {
            val controller=WorkspaceController(scope); val entered=CompletableDeferred<Unit>(); val release=CompletableDeferred<Unit>(); val bytes="data".toByteArray()
            val meta=metadata(bytes).put("text","data").put("readOnly",false)
            controller.enableFileMove(true)
            controller.open("pc:chat") { method,input -> when(method) {
                "workspace.roots" -> JSONObject("""{"roots":[{"id":"root","label":"Project"}]}""")
                "workspace.file.read" -> meta
                "workspace.file.chunk" -> { entered.complete(Unit); withContext(NonCancellable){release.await()}; JSONObject().put("base64","ZGF0YQ==").put("next",4).put("total",4).put("etag","stable") }
                "workspace.move" -> { assertEquals("folder/new.txt",input.getString("destination")); JSONObject().put("path","folder/new.txt") }
                else -> JSONObject("""{"entries":[]} """)
            } }
            controller.file(WorkspaceEntry("a.txt","a.txt",false,true))
            val selected=controller.state.value.file!!
            val pending=async { runCatching { controller.downloadFile("root",selected,root){_,_,_->} } }
            withTimeout(2000){entered.await()}; controller.directory(""); release.complete(Unit)
            assertTrue(pending.await().isFailure); assertTrue(root.listFiles().isNullOrEmpty())
            controller.file(WorkspaceEntry("a.txt","a.txt",false,true)); controller.moveFile("folder/new.txt")
            assertEquals("folder/new.txt",controller.state.value.file?.path); assertEquals("folder",controller.state.value.path)
        } finally { scope.cancel(); root.deleteRecursively() }
    }
}
