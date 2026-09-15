package dev.zyra.mobile.ui

import android.content.res.AssetManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.util.Base64
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.unit.dp
import com.caverock.androidsvg.SVG
import dev.zyra.mobile.R
import dev.zyra.mobile.data.ProjectMark
import dev.zyra.mobile.data.safeProjectSvg
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private data class ProjectBitmap(val bitmap: Bitmap, val brand: Boolean)
private object ProjectBitmaps {
    private val cache = LruCache<ProjectMark, ProjectBitmap>(96)
    @Synchronized fun load(assets: AssetManager, mark: ProjectMark): ProjectBitmap? {
        cache.get(mark)?.let { return it }
        val custom = runCatching {
            require(mark.encoded.length <= 24000)
            val bytes = Base64.decode(mark.encoded, Base64.DEFAULT)
            require(bytes.size <= 16384)
            if (mark.mime == "image/svg+xml") {
                val source = bytes.toString(Charsets.UTF_8)
                require(safeProjectSvg(source))
                svg(source)
            } else {
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                require(bounds.outWidth in 1..128 && bounds.outHeight in 1..128)
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            }
        }.getOrNull()
        val result = if (custom != null) ProjectBitmap(custom, false) else runCatching {
            require(Regex("[a-z0-9]{1,40}").matches(mark.slug))
            ProjectBitmap(svg(assets.open("project-icons/${mark.slug}.svg").bufferedReader().use { it.readText() }), true)
        }.getOrNull()
        if (result != null) cache.put(mark, result)
        return result
    }
    private fun svg(source: String): Bitmap {
        SVG.setInternalEntitiesEnabled(false)
        val image = SVG.getFromString(source)
        image.setDocumentWidth(64f); image.setDocumentHeight(64f)
        return Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888).also { image.renderToCanvas(Canvas(it)) }
    }
}

@Composable fun ProjectArtwork(mark: ProjectMark?, open: Boolean = false) {
    val assets = LocalContext.current.assets
    val preview = LocalInspectionMode.current
    val bitmap by produceState<ProjectBitmap?>(if (preview && mark != null) ProjectBitmaps.load(assets, mark) else null, mark) {
        value = if (mark == null) null else withContext(Dispatchers.IO) { ProjectBitmaps.load(assets, mark) }
    }
    val colors = MaterialTheme.colorScheme
    val color = runCatching { Color(android.graphics.Color.parseColor(mark?.color)) }.getOrDefault(colors.onSurface)
    fun contrast(a: Color, b: Color) = (maxOf(a.luminance(), b.luminance()) + .05f) / (minOf(a.luminance(), b.luminance()) + .05f)
    val mixed = lerp(color, colors.onSurface, if (colors.background.luminance() > .5f) .72f else .62f)
    val readable = if (contrast(color, colors.surfaceContainer) >= 2.8f) color else if (contrast(mixed, colors.surfaceContainer) >= 2.8f) mixed else colors.onSurface
    if (bitmap != null) Image(bitmap!!.bitmap.asImageBitmap(), null, Modifier.size(20.dp), colorFilter = if (bitmap!!.brand) ColorFilter.tint(readable) else null)
    else AppIcon(if (open) R.drawable.ic_folder_open else R.drawable.ic_folder, modifier = Modifier.size(19.dp))
}
