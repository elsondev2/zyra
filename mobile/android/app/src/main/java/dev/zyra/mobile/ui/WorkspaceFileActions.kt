package dev.zyra.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import dev.zyra.mobile.data.*

@Composable fun RowScope.WorkspaceFileActions(state: WorkspaceState, controller: WorkspaceController, connected: Boolean) {
    val file = state.file ?: return
    val clipboard = LocalClipboardManager.current
    val uriHandler = LocalUriHandler.current
    val selectedLink = state.fileLink
    if (selectedLink != null && !state.fileSource) {
        val external = MarkdownLinks.external(selectedLink)
        if (external != null || MarkdownLinks.isProjectFile(selectedLink)) IconButton(onClick = {
            if (external != null) runCatching { uriHandler.openUri(external) }
            else controller.followLink(selectedLink)
        }, enabled = !state.busy && !state.saving && (external != null || connected)) {
            AppIcon(R.drawable.ic_external_link, "Open selected link")
        }
    }
    var menu by remember { mutableStateOf(false) }
    var move by remember(file.path) { mutableStateOf(false) }
    var destination by remember(file.path) { mutableStateOf(file.path) }
    val transfers = rememberWorkspaceTransferMenu(state, controller, connected) { menu = false }
    val textFile = !file.binary && !file.large
    val render = fileRender(file.path)
    if (file.text != file.original || state.saving) IconButton(controller::save, enabled = connected && !state.busy) {
        if (state.saving) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
        else AppIcon(R.drawable.ic_check, "Save file")
    }
    if (move) ZyraSheet("Move or rename file", { move = false }) {
        Text("Choose a name or path within this shared folder. Existing files will not be replaced.", Modifier.padding(16.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        ZyraTextField(destination, { destination = it }, Modifier.fillMaxWidth().padding(horizontal = 16.dp))
        ZyraButton(onClick = { move = false; controller.moveFile(destination.trim()) }, enabled = destination.isNotBlank() && destination.trim() != file.path, modifier = Modifier.fillMaxWidth().padding(16.dp)) { Text("Move file") }
    }
    Box {
        IconButton({ menu = true }) { AppIcon(R.drawable.ic_ellipsis, "File options") }
        DropdownMenu(menu, { menu = false }, shape = MaterialTheme.shapes.medium, containerColor = MaterialTheme.colorScheme.surfaceContainer, tonalElevation = 0.dp) {
            if (textFile && render != null) {
                DropdownMenuItem(text = { Text(if (render == FileRender.MARKDOWN) "Rendered Markdown" else "Preview") }, leadingIcon = { AppIcon(R.drawable.ic_file) }, trailingIcon = { if (!state.fileSource) AppIcon(R.drawable.ic_check) },
                    onClick = { controller.fileSource(false); menu = false })
                DropdownMenuItem(text = { Text("Source") }, leadingIcon = { AppIcon(R.drawable.ic_terminal) }, trailingIcon = { if (state.fileSource) AppIcon(R.drawable.ic_check) },
                    onClick = { controller.fileSource(true); menu = false })
            }
            if (textFile && (render == null || state.fileSource)) DropdownMenuItem(text = { Text("Wrap lines") }, trailingIcon = { ZyraSwitch(state.fileWrap, null) }, onClick = { controller.fileWrap(!state.fileWrap) })
            if (textFile) DropdownMenuItem(text = { Text("Copy file") }, leadingIcon = { AppIcon(R.drawable.ic_copy) }, onClick = { clipboard.setText(AnnotatedString(file.text)); menu = false })
            transfers()
            if (controller.canMoveFiles()) DropdownMenuItem(text = { Text("Move or rename") }, leadingIcon = { AppIcon(R.drawable.ic_folder) }, enabled = connected && !state.busy && !file.readOnly,
                onClick = { destination = file.path; menu = false; move = true })
            DropdownMenuItem(text = { Text("Show in folder") }, leadingIcon = { AppIcon(R.drawable.ic_folder) }, onClick = { menu = false; controller.directory(file.path.substringBeforeLast('/', "")) })
            DropdownMenuItem(text = { Text("${file.size} bytes" + if (file.readOnly) " · Read only" else "") }, enabled = false, onClick = {})
        }
    }
}


@Composable fun WorkspaceFolderActions(state: WorkspaceState, controller: WorkspaceController, connected: Boolean) {
    var menu by remember { mutableStateOf(false) }
    Box {
        IconButton({ menu = true }) { AppIcon(R.drawable.ic_ellipsis, "Folder options") }
        DropdownMenu(menu, { menu = false }, shape = MaterialTheme.shapes.medium, containerColor = MaterialTheme.colorScheme.surfaceContainer) {
            DropdownMenuItem(text = { Text("Refresh folder") }, leadingIcon = { AppIcon(R.drawable.ic_refresh_cw) }, enabled = connected && !state.busy,
                onClick = { menu = false; controller.directory(state.path) })
            DropdownMenuItem(text = { Text("Show hidden files") }, trailingIcon = { ZyraSwitch(state.hidden, null) }, enabled = connected && !state.busy,
                onClick = { controller.toggleHidden() })
            if (state.roots.size > 1) state.roots.forEach { root ->
                DropdownMenuItem(text = { Text(workspaceRootLabel(root)) }, leadingIcon = { AppIcon(R.drawable.ic_folder) }, trailingIcon = { if (root.id == state.root) AppIcon(R.drawable.ic_check) },
                    enabled = connected && !state.busy, onClick = { menu = false; controller.root(root.id) })
            }
        }
    }
}

