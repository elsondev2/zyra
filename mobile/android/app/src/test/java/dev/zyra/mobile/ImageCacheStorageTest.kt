package dev.zyra.mobile

import dev.zyra.mobile.data.ImageCacheStorage
import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files
import java.io.File

class ImageCacheStorageTest {
    @Test fun onlyCompletedGeneratedImagesAreCleared() {
        val root = Files.createTempDirectory("cache-storage").toFile()
        try {
            val media = File(root,"media").apply { mkdir() }; val remote = File(root,"remote-markdown-images").apply { mkdir() }
            val hash = "a".repeat(64)
            File(media,"$hash-$hash.image").writeText("downloaded")
            File(remote,"$hash.image").writeText("remote")
            val preserved = listOf(File(media,"$hash-$hash.part"),File(media,"unsent.image"),File(root,"drafts.db"),File(root,"pairing.json"),File(root,"outbox.db"))
            preserved.forEach { it.writeText("keep") }
            val storage = ImageCacheStorage(root)
            assertEquals(2,storage.usage().files); assertEquals(16L,storage.usage().downloadableBytes); assertEquals(4L,storage.usage().inProgressBytes)
            assertEquals(0L,storage.clearCompleted().downloadableBytes)
            preserved.forEach { assertEquals("keep",it.readText()) }
        } finally { root.deleteRecursively() }
    }
    @Test fun absentCachesDoNotCreateDirectoriesOrTouchUnrecognizedFiles() {
        val root = Files.createTempDirectory("cache-storage").toFile()
        try {
            File(root,"random.image").writeText("keep")
            val storage = ImageCacheStorage(root)
            assertEquals(0,storage.usage().files); assertEquals(0,storage.clearCompleted().files)
            assertEquals(listOf("random.image"),root.listFiles().orEmpty().map { it.name })
        } finally { root.deleteRecursively() }
    }
    @Test fun workspaceDownloadsClearCompletedFilesButKeepActiveAndUnownedFiles() {
        val root = Files.createTempDirectory("cache-storage").toFile()
        try {
            val downloads = File(root, "workspace-downloads").apply { mkdir() }
            val owned = File(downloads, "c".repeat(64)).apply { mkdir() }
            val complete = File(owned, "report.pdf").apply { writeText("pdf") }
            val incoming = File(owned, ".incoming").apply { writeText("partial") }
            val unowned = File(downloads, "other").apply { mkdir() }
            val keep = File(unowned, "keep.txt").apply { writeText("keep") }
            File(unowned, ".incoming").writeText("unowned partial")
            val storage = ImageCacheStorage(root)
            assertEquals(3L, storage.usage().downloadableBytes)
            assertEquals(7L, storage.usage().inProgressBytes)
            assertEquals(7L, storage.clearCompleted().inProgressBytes)
            assertFalse(complete.exists()); assertEquals("partial", incoming.readText()); assertEquals("keep", keep.readText())
        } finally { root.deleteRecursively() }
    }
}
