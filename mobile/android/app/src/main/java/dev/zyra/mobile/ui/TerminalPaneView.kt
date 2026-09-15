package dev.zyra.mobile.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.zyra.mobile.R

@Composable fun TerminalPaneView(controller: TerminalController, title: String, hide: () -> Unit, end: () -> Unit, modifier: Modifier = Modifier) {
    val state by controller.state.collectAsStateWithLifecycle()
    var widget by remember { mutableStateOf<RemoteTerminalWidget?>(null) }
    val colors = MaterialTheme.colorScheme
    DisposableEffect(controller) { onDispose { controller.bind(null) } }
    TerminalPaneContent(state, title, TerminalPaneActions({ widget?.keyboard() }, { widget?.paste() }, { controller.select(state.selected) }, hide, end, { widget?.followCursor(); controller.send(it) }), modifier) { bounds ->
        AndroidView(factory = { context -> RemoteTerminalWidget(context, controller::send).also { view -> widget = view; controller.bind { view.frame(it) } } },
            update = { it.theme(colors.background.toArgb(), colors.onSurface.toArgb(), colors.primary.toArgb()) }, modifier = bounds,
            onRelease = { released -> if (widget === released) { controller.bind(null); widget = null } })
    }
}

data class TerminalPaneActions(val keyboard: () -> Unit, val paste: () -> Unit, val refresh: () -> Unit, val hide: () -> Unit, val end: () -> Unit, val send: (String) -> Unit)
@Composable fun TerminalPaneContent(state: TerminalState, title: String, actions: TerminalPaneActions, modifier: Modifier = Modifier, terminal: @Composable (Modifier) -> Unit) {
    var menu by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf(false) }
    val colors = MaterialTheme.colorScheme
    val inputEnabled = state.connected && !state.busy && !state.finished
    Column(modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            AppIcon(R.drawable.ic_terminal, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(8.dp))
            Text(title, Modifier.weight(1f), style = MaterialTheme.typography.labelLarge, maxLines = 1)
            if (state.busy) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
            IconButton(actions.keyboard, enabled = inputEnabled, modifier = Modifier.size(44.dp)) { AppIcon(R.drawable.ic_keyboard, "Keyboard for $title", Modifier.size(18.dp)) }
            Box {
                IconButton({ menu = true }, Modifier.size(44.dp)) { AppIcon(R.drawable.ic_ellipsis, "Options for $title", Modifier.size(18.dp)) }
                DropdownMenu(menu, { menu = false }, shape = MaterialTheme.shapes.medium, containerColor = colors.surfaceContainer, tonalElevation = 0.dp) {
                    DropdownMenuItem(text = { Text("Paste") }, onClick = { menu = false; actions.paste() }, enabled = inputEnabled)
                    DropdownMenuItem(text = { Text("Refresh screen") }, onClick = { menu = false; actions.refresh() }, enabled = state.connected)
                    DropdownMenuItem(text = { Text("Hide pane") }, onClick = { menu = false; actions.hide() })
                    DropdownMenuItem(text = { Text("End shell") }, onClick = { menu = false; confirm = true }, enabled = state.connected)
                }
            }
        }
        if (!state.connected) Text("Connection lost · shell stays on the PC", Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.labelSmall)
        else if (state.finished) Text("Shell finished", Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.labelSmall, color = colors.onSurfaceVariant)
        state.error?.let { Text(it, Modifier.padding(horizontal = 16.dp), color = colors.error, style = MaterialTheme.typography.labelSmall) }
        terminal(Modifier.weight(1f).fillMaxWidth())
        Row(Modifier.horizontalScroll(rememberScrollState())) {
            listOf("Esc" to "\u001b", "Tab" to "\t", "Ctrl C" to "\u0003", "Ctrl D" to "\u0004", "↑" to "\u001b[A", "↓" to "\u001b[B", "←" to "\u001b[D", "→" to "\u001b[C").forEach { (label, data) ->
                TextButton(onClick = { actions.send(data) }, enabled = inputEnabled, contentPadding = PaddingValues(horizontal = 12.dp)) { Text(label, style = MaterialTheme.typography.labelMedium) }
            }
        }
    }
    if (confirm) AlertDialog(onDismissRequest = { confirm = false }, title = { Text("End this shell?") }, text = { Text("This stops its running commands on the PC. Hide the pane to leave it running.") }, confirmButton = { TextButton({ confirm = false; actions.end() }) { Text("End shell") } }, dismissButton = { TextButton({ confirm = false }) { Text("Cancel") } })
}
