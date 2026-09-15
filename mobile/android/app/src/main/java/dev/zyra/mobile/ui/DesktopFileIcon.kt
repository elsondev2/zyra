package dev.zyra.mobile.ui

import android.content.res.AssetManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.unit.dp
import com.caverock.androidsvg.SVG
import dev.zyra.mobile.R
import dev.zyra.mobile.data.DesktopFileIcons
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

private object BundledFileArtwork {
    private var resolver: DesktopFileIcons? = null
    // Fixed 64px bitmaps, capped at 1.5 MiB. Assets never require a network request.
    private val cache = LruCache<String, Bitmap>(96)
    @Synchronized fun load(assets: AssetManager, path: String, directory: Boolean, light: Boolean, expanded: Boolean, strict: Boolean = false): Bitmap? {
        return runCatching {
            val icons = resolver ?: DesktopFileIcons(JSONObject(assets.open("desktop-file-icons.json").bufferedReader().use { it.readText() })).also { resolver = it }
            val name = icons.resolve(path, directory, light, expanded)
            cache.get(name) ?: run {
                SVG.setInternalEntitiesEnabled(false)
                val svg = assets.open("file-icons/$name").use { SVG.getFromInputStream(it) }
                Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888).also { bitmap ->
                    svg.setDocumentWidth(64f); svg.setDocumentHeight(64f)
                    svg.renderToCanvas(Canvas(bitmap)); cache.put(name, bitmap)
                }
            }
        }.getOrElse { if (strict) throw it else null }
    }
}

@Composable fun DesktopFileIcon(path: String, directory: Boolean = false, expanded: Boolean = false, modifier: Modifier = Modifier.size(24.dp)) {
    val assets = LocalContext.current.assets
    val light = MaterialTheme.colorScheme.background.luminance() > .5f
    val preview = LocalInspectionMode.current
    val bitmap by produceState<Bitmap?>(initialValue = if (preview) BundledFileArtwork.load(assets, path, directory, light, expanded, strict = true) else null, path, directory, light, expanded) {
        value = withContext(Dispatchers.IO) { BundledFileArtwork.load(assets, path, directory, light, expanded) }
    }
    if (bitmap != null) Image(bitmap!!.asImageBitmap(), null, modifier)
    else AppIcon(if (directory) R.drawable.ic_folder else R.drawable.ic_file, modifier = modifier)
}
