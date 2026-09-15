package dev.zyra.mobile.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.zyra.mobile.R

@Composable fun PluginsHeaderTitle(machine: String, connected: Boolean, machinePicker: (() -> Unit)? = null) {
    Column {
        Text("Plugins", style = MaterialTheme.typography.titleLarge)
        Row(Modifier.clip(RoundedCornerShape(8.dp)).then(if (machinePicker != null) Modifier.clickable(onClick = machinePicker) else Modifier).padding(vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(machine.ifBlank { "Choose a computer" } + if (!connected) " · Offline" else "", maxLines = 1, overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f, fill = false))
            if (machinePicker != null) AppIcon(R.drawable.ic_chevron_down, "Choose computer", Modifier.size(14.dp))
        }
    }
}

@Composable fun PluginsHeaderActions(controller: PluginsController, connected: Boolean, store: () -> Unit, scopePicker: (() -> Unit)? = null) {
    val state by controller.state.collectAsStateWithLifecycle()
    var menu by remember { mutableStateOf(false) }
    val ready = connected && state.loaded && !state.busy && !state.saving
    IconButton(onClick = controller::refresh, enabled = connected && !state.busy && !state.saving) {
        if (state.busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
        else AppIcon(R.drawable.ic_refresh_cw, "Refresh plugins", Modifier.size(20.dp))
    }
    Box {
        IconButton(onClick = { menu = true }) { AppIcon(R.drawable.ic_ellipsis, "Plugin options", Modifier.size(20.dp)) }
        DropdownMenu(menu, { menu = false }, shape = RoundedCornerShape(18.dp)) {
            DropdownMenuItem(text = { Text("Browse plugin store") }, leadingIcon = { AppIcon(R.drawable.ic_puzzle) }, enabled = connected,
                onClick = { menu = false; store() })
            scopePicker?.let { choose -> DropdownMenuItem(text = { Text("Choose scope") }, leadingIcon = { AppIcon(R.drawable.ic_folder) },
                onClick = { menu = false; choose() }) }
            if (state.catalog.hasChat || state.catalog.manageDefaults) DropdownMenuItem(text = {
                Column {
                    Text("New chat defaults")
                    Text(if (state.catalog.manageDefaults) "${state.catalog.defaultIds.size} selected · ${if (state.catalog.defaultsKind == "project") "This project" else "This computer"}" else "Managed on the computer",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            },
                leadingIcon = { AppIcon(R.drawable.ic_sliders_horizontal) }, enabled = ready && state.catalog.manageDefaults,
                onClick = { menu = false; controller.edit() })
        }
    }
}

