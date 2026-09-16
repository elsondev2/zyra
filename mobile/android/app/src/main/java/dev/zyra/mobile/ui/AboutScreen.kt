package dev.zyra.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import dev.zyra.mobile.BuildConfig
import dev.zyra.mobile.R

@Composable fun AboutScreen(navigate: (String) -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Column(Modifier.padding(horizontal = 24.dp, vertical = 30.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("┏━━━┳┓ ┏┳━┳━━┓\n┣━━┃┃┃ ┃┃┏┫┏┓┃\n┃┃━━┫┗━┛┃┃┃┏┓┃\n┗━━━┻━┓┏┻┛┗┛┗┛\n    ┏━┛┃\n    ┗━━┛",
                Modifier.clearAndSetSemantics { contentDescription = "Zyra" },
                fontFamily = FontFamily.Monospace, fontSize = 23.sp, lineHeight = 23.sp,
                color = MaterialTheme.colorScheme.primary, softWrap = false)
            Text("Your workspace, with you.", style = MaterialTheme.typography.titleMedium)
            Text("Android · " + BuildConfig.VERSION_NAME, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        HorizontalDivider(Modifier.padding(horizontal = 20.dp))
        ZyraSettingRow(R.drawable.ic_shield_check, "On your devices", "Chats stay on your computers. Pairing, recent history and drafts are saved locally on this phone.")
        ZyraSettingRow(R.drawable.ic_info, "Open-source licenses", "The projects behind Zyra for Android", click = { navigate("licenses") })
    }
}
private val licenses = listOf(
    Triple("camerax", "AndroidX CameraX", "Apache 2.0 license · 1.6.2"),
    Triple("rich-editor", "Compose Rich Editor", "Apache 2.0 license"),
    Triple("ksoup", "Ksoup HTML parser", "Apache 2.0 license"),
    Triple("jetbrains-markdown", "JetBrains Markdown", "Apache 2.0 license"),
    Triple("mermaid", "Mermaid diagrams", "MIT license · 11.17.2"),
    Triple("mermaid-bundle", "Diagram dependencies", "Bundled license notices"),
    Triple("jsoup", "Jsoup HTML parser", "MIT license"),
    Triple("commonmark", "CommonMark and GFM", "BSD 2-Clause license"),
    Triple("autolink", "Autolink", "MIT license"),
    Triple("simple-icons", "Desktop project icons", "Simple Icons · CC0 1.0"),
    Triple("material-icons", "Desktop file icons", "Material Icon Theme · MIT license"),
    Triple("androidsvg", "AndroidSVG", "Apache License 2.0"),
    Triple("termux", "Termux terminal", "Apache License 2.0"),
    Triple("termux-notice", "Terminal attribution", "Source and modifications"),
    Triple("lucide", "Lucide icons", "ISC license"),
    Triple("plugin-artwork", "Plugin artwork", "Publisher attribution"),
    Triple("webrtc", "WebRTC audio", "WebRTC and third-party notices"),
    Triple("webrtc-sdk", "WebRTC Android SDK", "MIT license"),
    Triple("bricolage", "Bricolage Grotesque", "SIL Open Font License 1.1"),
    Triple("hanken", "Hanken Grotesk", "SIL Open Font License 1.1")
)
@Composable fun LicensesScreen(navigate: (String) -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 12.dp)) {
        licenses.forEach { (id, name, description) -> ZyraSettingRow(title = name, subtitle = description, click = { navigate("license:$id") }) }
    }
}
fun licenseTitle(id: String) = licenses.find { it.first == id }?.second ?: "License"
@Composable fun LicenseScreen(id: String) {
    val context = LocalContext.current
    val text = remember(id) {
        val asset = when (id) { "camerax" -> "licenses/camerax.txt"; "rich-editor" -> "licenses/rich-editor.txt"; "ksoup" -> "licenses/ksoup.txt"; "jetbrains-markdown" -> "licenses/jetbrains-markdown.txt"; "mermaid-bundle" -> "licenses/mermaid-bundle.txt"; "mermaid" -> "licenses/mermaid.txt"; "jsoup" -> "licenses/jsoup.txt"; "commonmark" -> "licenses/commonmark.txt"; "autolink" -> "licenses/autolink.txt"; "material-icons" -> "licenses/material-icons.txt"; "androidsvg" -> "licenses/androidsvg.txt"; "plugin-artwork" -> "licenses/plugin-artwork.txt"; "termux" -> "licenses/termux.txt"; "termux-notice" -> "licenses/termux-notice.md"; "lucide" -> "lucide-LICENSE.txt"; "bricolage" -> "licenses/bricolage-OFL.txt"; "hanken" -> "licenses/hanken-OFL.txt"; "webrtc" -> "licenses/webrtc-NOTICES.md"; "webrtc-sdk" -> "licenses/webrtc-SDK-LICENSE.txt"; else -> null }
        asset?.let { runCatching { context.assets.open(it).bufferedReader().use { reader -> reader.readText() } }.getOrElse { "Could not load this license." } }.orEmpty()
    }
    val paragraphs = remember(text) { text.split(Regex("\\r?\\n\\s*\\r?\\n")) }
    androidx.compose.foundation.lazy.LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        items(paragraphs.size) { index -> SelectionContainer { Text(paragraphs[index], style = MaterialTheme.typography.bodySmall) } }
    }
}





