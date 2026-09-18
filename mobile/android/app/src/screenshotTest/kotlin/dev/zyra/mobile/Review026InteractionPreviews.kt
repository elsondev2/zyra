package dev.zyra.mobile
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.android.tools.screenshot.PreviewTest
import dev.zyra.mobile.data.*
import dev.zyra.mobile.ui.*

@PreviewTest @Preview(widthDp=320, heightDp=700, fontScale=1.3f)
@Composable fun PermissionReview() {
    ZyraTheme(Appearance(mode="dark")) { Surface { Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("Chat permissions", style=MaterialTheme.typography.titleLarge)
        listOf("approval-required", "auto-review", "edits-only", "full-access", "").forEach { mode ->
            Row { Text("Project · Computer", Modifier.weight(1f), style=MaterialTheme.typography.labelSmall); PermissionStatus(mode, {}) }
        }
        HorizontalDivider(Modifier.padding(vertical=16.dp))
        PermissionControls("edits-only", true, {})
    } } }
}
