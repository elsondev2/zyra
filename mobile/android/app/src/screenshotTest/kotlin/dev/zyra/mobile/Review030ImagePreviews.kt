package dev.zyra.mobile

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.android.tools.screenshot.PreviewTest
import dev.zyra.mobile.data.Appearance
import dev.zyra.mobile.ui.*

@PreviewTest @Preview(name = "Automatic image previews", widthDp = 320, heightDp = 440, fontScale = 1.15f)
@Composable fun AutomaticImagesReview() {
    val context = LocalContext.current
    val image = remember {
        java.io.File(context.cacheDir, "image-preview-review.png").also { file ->
            context.resources.openRawResource(R.drawable.plugin_logo_test_android_apps).use { input -> file.outputStream().use { input.copyTo(it) } }
        }
    }
    ZyraTheme(Appearance(mode = "dark")) { Surface { Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("Images in a conversation", style = MaterialTheme.typography.titleMedium)
        TimelineMessage(dev.zyra.mobile.data.TimelineItem("image-message", "user", "Use this image as a reference."), media = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MessageImageTile(image)

            }
        }) {}
        Text("Loading and retry states", style = MaterialTheme.typography.labelMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { MessageImageTile(null, 2, 346000, true, false, {}, {}); MessageImageTile(null, 1, 346000, false, true, {}, {}) }
    } } }
}
