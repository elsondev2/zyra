package dev.zyra.mobile.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.provider.OpenableColumns
import java.io.File
import java.io.FileOutputStream

object PhotoPreparation {
    fun add(context: Context, store: AttachmentStore, machine: String, session: String, uri: Uri, optimize: Boolean): LocalAttachment {
        val temporary = File.createTempFile("zyra-photo-", ".tmp", context.cacheDir)
        var optimized: File? = null
        try {
            var size = 0L
            context.contentResolver.openInputStream(uri)?.use { input -> FileOutputStream(temporary).use { output ->
                val buffer = ByteArray(48 * 1024)
                while (true) { val read = input.read(buffer); if (read < 0) break; if (read == 0) continue; size += read
                    require(size <= AttachmentStore.MAX_FILE) { "Choose an image smaller than 20 MB." }; output.write(buffer, 0, read)
                }
            } } ?: error("This image cannot be opened. Choose it again.")
            val header = temporary.inputStream().use { input -> ByteArray(12).let { it.copyOf(input.read(it).coerceAtLeast(0)) } }
            val mime = when {
                header.take(8).map { it.toInt() and 255 } == listOf(137,80,78,71,13,10,26,10) -> "image/png"
                header.size >= 3 && header[0] == 0xff.toByte() && header[1] == 0xd8.toByte() && header[2] == 0xff.toByte() -> "image/jpeg"
                String(header.take(6).toByteArray()) in listOf("GIF87a", "GIF89a") -> "image/gif"
                header.size >= 12 && String(header.copyOfRange(0,4)) == "RIFF" && String(header.copyOfRange(8,12)) == "WEBP" -> "image/webp"
                else -> error("Use PNG, JPEG, GIF or WebP images.")
            }
            var name = (if (uri.scheme == "file") File(uri.path ?: "").name else context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { if (it.moveToFirst()) it.getString(0) else null }) ?: "Attached image"
            name = name.replace(Regex("[\\p{Cntrl}]"), " ").take(180).ifBlank { "Attached image" }
            var source = temporary
            if (optimize && mime == "image/jpeg") {
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }; BitmapFactory.decodeFile(temporary.path, bounds)
                require(bounds.outWidth > 0 && bounds.outHeight > 0) { "This JPEG could not be decoded." }
                var sample = 1
                while (maxOf(bounds.outWidth / sample, bounds.outHeight / sample) > 2048) sample *= 2
                val bitmap = BitmapFactory.decodeFile(temporary.path, BitmapFactory.Options().apply { inSampleSize = sample }) ?: error("This image could not be opened.")
                var rotated: Bitmap? = null
                try {
                    val orientation = ExifInterface(temporary.path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
                    val matrix = Matrix().apply {
                        when (orientation) {
                            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> setScale(-1f, 1f)
                            ExifInterface.ORIENTATION_ROTATE_180 -> setRotate(180f)
                            ExifInterface.ORIENTATION_FLIP_VERTICAL -> setScale(1f, -1f)
                            ExifInterface.ORIENTATION_TRANSPOSE -> { setRotate(90f); postScale(-1f, 1f) }
                            ExifInterface.ORIENTATION_ROTATE_90 -> setRotate(90f)
                            ExifInterface.ORIENTATION_TRANSVERSE -> { setRotate(270f); postScale(-1f, 1f) }
                            ExifInterface.ORIENTATION_ROTATE_270 -> setRotate(270f)
                        }
                    }
                    val prepared = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true); rotated = prepared
                    optimized = File.createTempFile("zyra-photo-sized-", ".jpg", context.cacheDir)
                    FileOutputStream(optimized).use { check(prepared.compress(Bitmap.CompressFormat.JPEG, 85, it)) { "Could not prepare this photo." } }
                    source = optimized!!
                } finally { if (rotated !== bitmap) rotated?.recycle(); bitmap.recycle() }
            }
            return source.inputStream().use { store.add(machine, session, name, mime, it) }
        } finally { temporary.delete(); optimized?.delete() }
    }
}
