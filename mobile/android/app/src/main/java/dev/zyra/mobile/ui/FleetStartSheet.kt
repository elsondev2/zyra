package dev.zyra.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.clickable
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import org.json.JSONObject

@Composable fun FleetStartSheet(state: FleetState, connected: Boolean, controller: FleetController) {
    val definition = state.definition ?: return
    var goal by rememberSaveable(definition.name) { mutableStateOf("") }
    var advanced by rememberSaveable(definition.name) { mutableStateOf(false) }
    var arguments by remember(definition.name) { mutableStateOf(listOf<Pair<String, String>>()) }
    val keys = arguments.map { it.first.trim() }
    val invalidArguments = keys.any { it.isBlank() } || keys.distinct().size != keys.size
    val close = { if (!state.busy) controller.dismiss() }
    ZyraSheet(definition.name, close, gesturesEnabled = !state.busy, footer = {
        ZyraButton(onClick = {
            val args = JSONObject()
            arguments.forEach { (key, value) -> args.put(key.trim(), value.toLongOrNull() ?: value.toDoubleOrNull()?.takeIf { it.isFinite() } ?: when (value) { "true" -> true; "false" -> false; else -> value }) }
            controller.launch(goal, args)
        }, enabled = state.definitionReady && definition.runnable && connected && !state.busy && !invalidArguments && (state.kind == "workflows" || goal.isNotBlank()), modifier = Modifier.fillMaxWidth()) {
            if (state.busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
            else AppIcon(R.drawable.ic_play, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text(if (state.busy) { if (state.definitionReady) "Starting…" else "Loading…" } else "Start on PC")
        }
    }) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (definition.description.isNotBlank()) Text(definition.description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            if (!state.definitionReady && !state.busy) TextButton(onClick = { controller.definition(definition) }, enabled = connected) { Text("Retry loading") }
            if (state.kind == "agents") ZyraTextField(value = goal, onValueChange = { goal = it.take(30000) }, placeholder = { Text("What should this agent do?") }, minLines = 2, maxLines = 6, modifier = Modifier.fillMaxWidth())
            else Text("Starting approves this workflow's tools and budget on your PC.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (!definition.runnable) Text("Review this definition on the PC before starting it.", color = MaterialTheme.colorScheme.error)
            if (invalidArguments) Text("Give each argument a unique name in Options.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            Row(Modifier.fillMaxWidth().clickable { advanced = !advanced }.padding(vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                AppIcon(R.drawable.ic_sliders_horizontal, modifier = Modifier.size(18.dp))
                Text("Options & instructions", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                AppIcon(R.drawable.ic_chevron_down, modifier = Modifier.size(16.dp).rotate(if (advanced) 180f else 0f))
            }
            if (advanced) {
                if (definition.note.isNotBlank()) Text(definition.note, style = MaterialTheme.typography.bodySmall)
                if (state.kind == "workflows") {
                    if (state.detail.isNotBlank()) Text(state.detail, style = MaterialTheme.typography.bodySmall)
                    arguments.forEachIndexed { index, pair ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            ZyraTextField(value = pair.first, onValueChange = { key -> arguments = arguments.toMutableList().also { it[index] = key to pair.second } }, placeholder = { Text("Name") }, modifier = Modifier.weight(1f), singleLine = true)
                            ZyraTextField(value = pair.second, onValueChange = { value -> arguments = arguments.toMutableList().also { it[index] = pair.first to value } }, placeholder = { Text("Value") }, modifier = Modifier.weight(1f), singleLine = true)
                            IconButton(onClick = { arguments = arguments.filterIndexed { item, _ -> item != index } }) { AppIcon(R.drawable.ic_x, "Remove argument", Modifier.size(16.dp)) }
                        }
                    }
                    TextButton(onClick = { arguments = arguments + ("" to "") }, enabled = arguments.size < 20 && !state.busy) {
                        AppIcon(R.drawable.ic_plus, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)); Text("Add argument")
                    }
                }
                Text("Instructions", style = MaterialTheme.typography.labelLarge)
                SelectionContainer { Markdown(state.source.ifBlank { "No instructions provided." }) }
            }
        }
    }
}
