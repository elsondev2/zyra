package dev.zyra.mobile.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R

/** Camera presentation stays independent of camera hardware and permission ownership. */
@Composable fun CameraPanel(ready: Boolean = true, busy: Boolean = false, granted: Boolean = true, denied: Boolean = false,
    failure: String? = null, front: Boolean = false, flash: Boolean = false,
    onCancel: () -> Unit = {}, onCapture: () -> Unit = {}, onPermission: () -> Unit = {},
    onFlip: () -> Unit = {}, onFlash: () -> Unit = {}, preview: @Composable BoxScope.() -> Unit = {}) {
    var options by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxWidth().height(288.dp).background(Color.Black)) {
        preview()
        if (!granted || failure != null) Column(Modifier.align(Alignment.Center).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(failure ?: if (denied) "Allow camera access to take a picture." else "Opening camera…", color = Color.White, style = MaterialTheme.typography.bodyMedium)
            if (denied) TextButton(onClick = onPermission) { Text("Allow camera", color = Color.White) }
        } else if (!ready) CircularProgressIndicator(Modifier.align(Alignment.Center).size(24.dp), color = Color.White, strokeWidth = 2.dp)
        Row(Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = .75f)))).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            FilledIconButton(onClick = onCancel, colors = IconButtonDefaults.filledIconButtonColors(containerColor = Color.Black.copy(alpha = .55f), contentColor = Color.White)) { AppIcon(R.drawable.ic_arrow_left, "Cancel camera") }
            OutlinedIconButton(onClick = onCapture, enabled = ready && granted && !busy && failure == null, modifier = Modifier.size(64.dp), shape = CircleShape, border = BorderStroke(3.dp, Color.White), colors = IconButtonDefaults.outlinedIconButtonColors(contentColor = Color.White)) {
                if (busy) CircularProgressIndicator(Modifier.size(30.dp), color = Color.White, strokeWidth = 2.dp)
                else Surface(Modifier.size(48.dp), shape = CircleShape, color = Color.White) {}
            }
            Box {
                FilledIconButton(onClick = { options = true }, enabled = ready && granted && !busy, colors = IconButtonDefaults.filledIconButtonColors(containerColor = Color.Black.copy(alpha = .55f), contentColor = Color.White)) { AppIcon(R.drawable.ic_ellipsis, "Camera options") }
                DropdownMenu(options, { options = false }, shape = MaterialTheme.shapes.medium) {
                    DropdownMenuItem(text = { Text(if (front) "Rear camera" else "Front camera") }, leadingIcon = { AppIcon(R.drawable.ic_camera) }, onClick = { options = false; onFlip() })
                    DropdownMenuItem(text = { Text("Flash") }, trailingIcon = { ZyraSwitch(flash, null) }, onClick = onFlash)
                }
            }
        }
    }
}
