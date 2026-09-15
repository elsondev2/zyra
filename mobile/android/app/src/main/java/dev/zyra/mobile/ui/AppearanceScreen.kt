package dev.zyra.mobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import dev.zyra.mobile.data.Appearance

@Composable fun AppearanceScreen(value: Appearance, change: (Appearance) -> Unit) {
    val themes = DesktopThemes.load(LocalContext.current)
    var picker by rememberSaveable { mutableStateOf<String?>(null) }
    var search by rememberSaveable { mutableStateOf("") }
    var fontPicker by remember { mutableStateOf(false) }
    var listPicker by remember { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 28.dp)) {
        item { Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            ZyraSegments(listOf("system" to "System", "light" to "Light", "dark" to "Dark"), value.mode, { change(value.copy(mode = it)) })
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                listOf(false, true).forEach { dark ->
                    val theme = themes.find { it.id == if (dark) value.dark else value.light } ?: themes.first { it.dark == dark }
                    Column(Modifier.weight(1f).clickable { picker = if (dark) "dark" else "light"; search = "" }, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            AppIcon(if (dark) R.drawable.ic_moon else R.drawable.ic_sun, modifier = Modifier.size(16.dp))
                            Text(if (dark) "Dark" else "Light", style = MaterialTheme.typography.labelMedium)
                        }
                        ThemeConversationPreview(theme, Modifier.fillMaxWidth().height(88.dp))
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(theme.name, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            AppIcon(R.drawable.ic_chevron_down, "Choose theme", Modifier.size(14.dp))
                        }
                    }
                }
            }
        } }
        item { AppearanceValueRow("Typeface", when (value.font) { "hanken" -> "Hanken"; "system" -> "System"; else -> "Bricolage" }) { fontPicker = true } }
        item { HorizontalDivider(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) }
        item { SectionCaption("Chat display") }
        item { AppearanceValueRow("Chat list", if (value.sidebar == "v2") "Desktop inbox" else "Compact list") { listPicker = true } }
        item { ZyraSettingRow(title = "Message timestamps", click = { change(value.copy(timestamps = !value.timestamps)) }, trailing = { ZyraSwitch(value.timestamps, null) }) }
        item { ZyraSettingRow(title = "Work duration", click = { change(value.copy(workDetails = !value.workDetails)) }, trailing = { ZyraSwitch(value.workDetails, null) }) }
        item { ZyraSettingRow(title = "Thought processes", click = { change(value.copy(thoughtProcesses = !value.thoughtProcesses)) }, trailing = { ZyraSwitch(value.thoughtProcesses, null) }) }
        item { ZyraSettingRow(title = "Action counts", click = { change(value.copy(actionCounts = !value.actionCounts)) }, trailing = { ZyraSwitch(value.actionCounts, null) }) }
        item { HorizontalDivider(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) }
        item { SectionCaption("Accessibility") }
        item { ZyraSettingRow(title = "Reduce motion", click = { change(value.copy(reduceMotion = !value.reduceMotion)) }, trailing = { ZyraSwitch(value.reduceMotion, null) }) }
    }
    if (listPicker) ZyraSheet("Chat list", { listPicker = false }) {
        ZyraSettingRow(title = "Desktop inbox", subtitle = "Sidebar V2 · Project, activity and model", click = { change(value.copy(sidebar = "v2")) }, trailing = { ZyraSelectionMark(value.sidebar == "v2") })
        ZyraSettingRow(title = "Compact list", subtitle = "Sidebar V1 · Titles with project names", click = { change(value.copy(sidebar = "v1")) }, trailing = { ZyraSelectionMark(value.sidebar == "v1") })
    }
    if (fontPicker) ZyraSheet("Typeface", { fontPicker = false }) {
        listOf("bricolage" to "Bricolage Grotesque", "hanken" to "Hanken Grotesk", "system" to "Android system").forEach { (id, title) ->
            ZyraSettingRow(title = title, subtitle = if (id == "bricolage") "Desktop default" else null, click = { change(value.copy(font = id)) }, trailing = { if (value.font == id) AppIcon(R.drawable.ic_check, "Selected") })
        }
    }
    picker?.let { family ->
        // Keep the long theme grid's edge drags in its scroll container, rather
        // than handing them to the modal's drag/settle animation.
        ZyraSheet(if (family == "dark") "Dark themes" else "Light themes", { picker = null }, gesturesEnabled = false) {
            Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                ZyraSearchField(search, { search = it }, "Find a theme", Modifier.fillMaxWidth())
                val filtered = themes.filter { it.dark == (family == "dark") && it.name.contains(search, true) }
                if (filtered.isEmpty()) Text("No themes match this search.", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(vertical = 12.dp))
                filtered.chunked(2).forEach { row -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    row.forEach { theme ->
                        val selected = theme.id == if (theme.dark) value.dark else value.light
                        Column(Modifier.weight(1f).clickable {
                            change(if (theme.dark) value.copy(dark = theme.id, mode = if (value.mode == "system") "system" else "dark") else value.copy(light = theme.id, mode = if (value.mode == "system") "system" else "light"))
                        }, verticalArrangement = Arrangement.spacedBy(7.dp)) {
                            ThemeConversationPreview(theme, Modifier.fillMaxWidth().height(92.dp).border(if (selected) 2.dp else 0.dp, if (selected) MaterialTheme.colorScheme.primary else Color.Transparent, MaterialTheme.shapes.medium))
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Text(theme.name, Modifier.weight(1f), style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                if (selected) AppIcon(R.drawable.ic_check, "Selected", Modifier.size(14.dp))
                            }
                        }
                    }
                    if (row.size == 1) Spacer(Modifier.weight(1f))
                } }
                Spacer(Modifier.height(8.dp))
            }
        }
    }
}
@Composable private fun SectionCaption(title: String) { Text(title, Modifier.padding(horizontal = 20.dp, vertical = 4.dp), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
@Composable private fun AppearanceValueRow(title: String, value: String, click: () -> Unit) {
    ZyraSettingRow(title = title, click = click, trailing = {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(value, Modifier.widthIn(max = 150.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            AppIcon(R.drawable.ic_chevron_right, modifier = Modifier.size(14.dp))
        }
    })
}
@Composable private fun ThemeConversationPreview(theme: DesktopTheme, modifier: Modifier = Modifier) {
    Column(modifier.background(theme.color("bg"), MaterialTheme.shapes.medium).border(1.dp, theme.color("border"), MaterialTheme.shapes.medium).padding(10.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Surface(Modifier.align(Alignment.End).fillMaxWidth(.78f), color = theme.color("card"), shape = RoundedCornerShape(10.dp)) {
            Box(Modifier.height(20.dp))
        }
        Box(Modifier.fillMaxWidth(.6f).height(4.dp).background(theme.color("textDarker"), RoundedCornerShape(2.dp)))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f).height(10.dp).background(theme.color("card"), RoundedCornerShape(6.dp)))
            Spacer(Modifier.width(6.dp)); Box(Modifier.size(12.dp).background(theme.color("primary"), RoundedCornerShape(4.dp)))
        }
    }
}

