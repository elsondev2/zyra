package dev.zyra.mobile.ui

import android.content.res.AssetManager
import android.graphics.Bitmap
import android.graphics.Canvas
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
import dev.zyra.mobile.data.ArtworkCache
import dev.zyra.mobile.data.DesktopFileIcons
import org.json.JSONObject

private object BundledFileArtwork {
    private val resolvers = ArtworkCache<Unit, DesktopFileIcons>(1)
    // Fixed 64px bitmaps, capped at 1.5 MiB. Assets never require a network request.
    private val cache = ArtworkCache<String, Bitmap>()
    private fun resolver(assets: AssetManager) = DesktopFileIcons(JSONObject(assets.open("desktop-file-icons.json").bufferedReader().use { it.readText() }))
    fun peek(path: String, directory: Boolean, light: Boolean, expanded: Boolean): Bitmap? =
        runCatching { resolvers.peek(Unit)?.resolve(path, directory, light, expanded)?.let(cache::peek) }.getOrNull()

    suspend fun load(assets: AssetManager, path: String, directory: Boolean, light: Boolean, expanded: Boolean): Bitmap? {
        val icons = resolvers.load(Unit) { runCatching { resolver(assets) }.getOrNull() } ?: return null
        val name = runCatching { icons.resolve(path, directory, light, expanded) }.getOrNull() ?: return null
        return cache.load(name) { runCatching { decode(assets, name) }.getOrNull() }
    }
    fun preview(assets: AssetManager, path: String, directory: Boolean, light: Boolean, expanded: Boolean): Bitmap? {
        val icons = resolvers.preview(Unit) { resolver(assets) } ?: return null
        val name = icons.resolve(path, directory, light, expanded)
        return cache.preview(name) { decode(assets, name) }
    }
    private fun decode(assets: AssetManager, name: String): Bitmap {
        SVG.setInternalEntitiesEnabled(false)
        val svg = assets.open("file-icons/$name").use { SVG.getFromInputStream(it) }
        return Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888).also { bitmap ->
            svg.setDocumentWidth(64f); svg.setDocumentHeight(64f)
            svg.renderToCanvas(Canvas(bitmap))
        }
    }
}

@Composable fun DesktopFileIcon(path: String, directory: Boolean = false, expanded: Boolean = false, modifier: Modifier = Modifier.size(24.dp)) {
    val assets = LocalContext.current.assets
    val light = MaterialTheme.colorScheme.background.luminance() > .5f
    val preview = LocalInspectionMode.current
    val bitmap = key(path, directory, light, expanded) {
        val loaded by produceState<Bitmap?>(initialValue = if (preview) BundledFileArtwork.preview(assets, path, directory, light, expanded) else BundledFileArtwork.peek(path, directory, light, expanded), path, directory, light, expanded) {
            value = BundledFileArtwork.load(assets, path, directory, light, expanded)
        }
        loaded
    }
    if (bitmap != null) Image(bitmap!!.asImageBitmap(), null, modifier)
    else AppIcon(if (directory) R.drawable.ic_folder else R.drawable.ic_file, modifier = modifier)
}
