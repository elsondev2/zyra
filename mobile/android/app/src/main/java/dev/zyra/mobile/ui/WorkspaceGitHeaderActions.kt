package dev.zyra.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import dev.zyra.mobile.R

@Composable fun WorkspaceGitHeaderActions(state: WorkspaceState, controller: WorkspaceController, connected: Boolean) {
    var menu by remember { mutableStateOf(false) }
    val clipboard = LocalClipboardManager.current
    Box {
        IconButton({ menu = true }) { AppIcon(R.drawable.ic_ellipsis, "Git options") }
        DropdownMenu(menu, { menu = false }, shape = MaterialTheme.shapes.medium, containerColor = MaterialTheme.colorScheme.surfaceContainer) {
            if (state.repository && state.gitTotal > 0) {
                listOf(false to "Working changes", true to "Staged changes").forEach { (staged, title) ->
                    DropdownMenuItem(text = { Text(title) }, trailingIcon = { if (state.staged == staged) AppIcon(R.drawable.ic_check) }, enabled = connected && !state.busy,
                        onClick = { menu = false; controller.gitMode(staged) })
                }
            }
            if (state.diff != null) {
                DropdownMenuItem(text = { Text("Wrap lines") }, trailingIcon = { ZyraSwitch(state.fileWrap, null) }, onClick = { controller.fileWrap(!state.fileWrap) })
                DropdownMenuItem(text = { Text("Copy diff") }, leadingIcon = { AppIcon(R.drawable.ic_copy) }, onClick = { clipboard.setText(AnnotatedString(state.diff)); menu = false })
            }
            if (state.branch.isNotBlank()) DropdownMenuItem(text = { Text(state.branch) }, leadingIcon = { AppIcon(R.drawable.ic_git_branch) }, enabled = false, onClick = {})
            if (state.roots.size > 1) state.roots.forEach { root ->
                DropdownMenuItem(text = { Text(workspaceRootLabel(root)) }, leadingIcon = { AppIcon(R.drawable.ic_folder) }, trailingIcon = { if (state.root == root.id) AppIcon(R.drawable.ic_check) },
                    enabled = connected && !state.busy, onClick = { menu = false; controller.gitRoot(root.id) })
            }
        }
    }
}
