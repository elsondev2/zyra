package dev.zyra.mobile.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import dev.zyra.mobile.data.SheetDragPolicy
import kotlinx.coroutines.launch

private val LocalSheetHeaderDrag = staticCompositionLocalOf<Modifier> { Modifier }

// Compact visual controls keep a 48dp touch target. Desktop's surface, border,
// rounded search and restrained inset selection are shared across destinations.
@Composable fun ZyraTextField(value: String, onValueChange: (String) -> Unit, modifier: Modifier = Modifier,
    enabled: Boolean = true, label: (@Composable () -> Unit)? = null, placeholder: (@Composable () -> Unit)? = null,
    minLines: Int = 1, maxLines: Int = Int.MAX_VALUE, singleLine: Boolean = false, shape: androidx.compose.ui.graphics.Shape = RoundedCornerShape(12.dp),
    textStyle: TextStyle = MaterialTheme.typography.bodyMedium, keyboardOptions: KeyboardOptions = KeyboardOptions.Default) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        label?.let { CompositionLocalProvider(LocalTextStyle provides MaterialTheme.typography.labelMedium, LocalContentColor provides MaterialTheme.colorScheme.onSurfaceVariant) { it() } }
        Surface(Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.surfaceContainer, shape = shape, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
            BasicTextField(value, onValueChange, enabled = enabled, minLines = minLines, maxLines = maxLines, singleLine = singleLine,
                textStyle = textStyle.copy(color = MaterialTheme.colorScheme.onSurface.copy(alpha = if (enabled) 1f else .5f)), keyboardOptions = keyboardOptions,
                cursorBrush = SolidColor(MaterialTheme.colorScheme.primary), modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(14.dp),
                decorationBox = { inner -> Box { if (value.isEmpty()) CompositionLocalProvider(LocalContentColor provides MaterialTheme.colorScheme.onSurfaceVariant, LocalTextStyle provides textStyle) { placeholder?.invoke() }; inner() } })
        }
    }
}

@Composable fun ZyraSelectionMark(selected: Boolean, modifier: Modifier = Modifier) {
    Surface(modifier.size(20.dp), shape = RoundedCornerShape(6.dp), color = if (selected) MaterialTheme.colorScheme.primary else Color.Transparent, contentColor = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
        border = if (selected) null else BorderStroke(1.dp, MaterialTheme.colorScheme.outline)) {
        if (selected) Box(contentAlignment = Alignment.Center) { AppIcon(R.drawable.ic_check, modifier = Modifier.size(14.dp)) }
    }
}

@Composable fun ZyraPill(selected: Boolean, onClick: () -> Unit, label: @Composable () -> Unit, enabled: Boolean = true) {
    Surface(Modifier.padding(vertical = 5.dp).heightIn(min = 38.dp).clip(RoundedCornerShape(10.dp)).selectable(selected = selected, enabled = enabled, role = Role.RadioButton, onClick = onClick),
        shape = RoundedCornerShape(10.dp), color = if (selected) MaterialTheme.colorScheme.surfaceContainerHighest else MaterialTheme.colorScheme.surfaceContainer,
        contentColor = if (selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
        border = BorderStroke(1.dp, if (selected) MaterialTheme.colorScheme.outline else MaterialTheme.colorScheme.outlineVariant)) {
        Box(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), contentAlignment = Alignment.Center) { CompositionLocalProvider(LocalTextStyle provides MaterialTheme.typography.labelMedium) { label() } }
    }
}

@Composable fun ZyraSearchField(value: String, change: (String) -> Unit, placeholder: String, modifier: Modifier = Modifier) {
    Surface(modifier.heightIn(min = 48.dp), shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Row(Modifier.padding(start = 14.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            AppIcon(R.drawable.ic_search, modifier = Modifier.size(18.dp))
            BasicTextField(value, change, singleLine = true, modifier = Modifier.weight(1f).padding(vertical = 12.dp),
                textStyle = MaterialTheme.typography.bodyMedium.copy(color = MaterialTheme.colorScheme.onSurface), cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                decorationBox = { inner -> Box { if (value.isEmpty()) Text(placeholder, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1); inner() } })
            if (value.isNotEmpty()) IconButton(onClick = { change("") }) { AppIcon(R.drawable.ic_x, "Clear search", Modifier.size(16.dp)) }
            else Spacer(Modifier.width(8.dp))
        }
    }
}

@Composable fun ZyraSwitch(checked: Boolean, change: ((Boolean) -> Unit)?, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val duration = if (LocalReduceMotion.current) 0 else 160
    val track by animateColorAsState(if (checked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline, tween(duration), label = "Switch color")
    val position by animateDpAsState(if (checked) 17.dp else 3.dp, tween(duration), label = "Switch position")
    Box(modifier.size(48.dp).then(if (change != null) Modifier.toggleable(value = checked, enabled = enabled, role = Role.Switch, onValueChange = change) else Modifier), contentAlignment = Alignment.Center) {
        Box(Modifier.size(38.dp, 24.dp).background(track.copy(alpha = if (enabled) 1f else .4f), CircleShape)) {
            Box(Modifier.padding(start = position, top = 3.dp).size(18.dp).background(Color.White, CircleShape))
        }
    }
}

@Composable fun ZyraSegments(options: List<Pair<String, String>>, selected: String, select: (String) -> Unit, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().selectableGroup().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceContainer).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        options.forEach { (id, label) ->
            val active = id == selected
            Surface(Modifier.weight(1f).heightIn(min = 44.dp).selectable(active, role = Role.RadioButton, onClick = { select(id) }),
                shape = RoundedCornerShape(9.dp), color = if (active) MaterialTheme.colorScheme.background else Color.Transparent,
                border = if (active) BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant) else null) {
                Box(Modifier.padding(horizontal = 8.dp, vertical = 10.dp), contentAlignment = Alignment.Center) {
                    Text(label, style = MaterialTheme.typography.labelMedium, color = if (active) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

@Composable fun ZyraSettingRow(icon: Int? = null, title: String, subtitle: String? = null, modifier: Modifier = Modifier, click: (() -> Unit)? = null, trailing: @Composable (() -> Unit)? = null, leading: @Composable (() -> Unit)? = null) {
    Row(modifier.fillMaxWidth().then(if (click != null) Modifier.clickable(onClick = click) else Modifier).padding(horizontal = 20.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        if (leading != null) leading() else icon?.let { AppIcon(it, modifier = Modifier.size(20.dp)) }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(title, style = MaterialTheme.typography.bodyMedium)
            subtitle?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        trailing?.invoke() ?: if (click != null) AppIcon(R.drawable.ic_chevron_right, modifier = Modifier.size(16.dp)) else Unit
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun ZyraSheet(title: String, close: () -> Unit, footer: (@Composable () -> Unit)? = null, gesturesEnabled: Boolean = true, content: @Composable ColumnScope.() -> Unit) {
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val offset = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()
    val density = androidx.compose.ui.platform.LocalDensity.current.density
    val reduced = LocalReduceMotion.current
    val currentClose by rememberUpdatedState(close)
    var dismissing by remember { mutableStateOf(false) }
    val headerDrag = Modifier.draggable(rememberDraggableState { delta ->
        scope.launch(start = kotlinx.coroutines.CoroutineStart.UNDISPATCHED) { offset.snapTo((offset.value + delta).coerceAtLeast(0f)) }
    }, Orientation.Vertical, enabled = gesturesEnabled && !dismissing,
        onDragStarted = { offset.stop() }, onDragStopped = { velocity ->
            if (SheetDragPolicy.dismiss(offset.value, velocity, density)) {
                dismissing = true
                try { sheet.hide(); currentClose() } finally { dismissing = false }
            } else offset.animateTo(0f, tween(if (reduced) 0 else 180))
        })
    // Header-only dragging prevents the Material sheet's ancestor pre/post-fling
    // connection from intercepting or re-settling a scrolling body.
    ModalBottomSheet(onDismissRequest = close, sheetState = sheet, sheetMaxWidth = 600.dp,
        modifier = Modifier.graphicsLayer { translationY = offset.value },
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp), containerColor = MaterialTheme.colorScheme.background,
        tonalElevation = 0.dp, dragHandle = null, sheetGesturesEnabled = false) {
        CompositionLocalProvider(LocalSheetHeaderDrag provides headerDrag) { ZyraSheetContent(title, close, footer, content) }
    }
}


@Composable fun ZyraSheetContent(title: String, close: () -> Unit, footer: (@Composable () -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
        Column(Modifier.fillMaxWidth().heightIn(max = androidx.compose.ui.platform.LocalConfiguration.current.screenHeightDp.dp * .88f).imePadding()) {
            Column(LocalSheetHeaderDrag.current) {
            Box(Modifier.fillMaxWidth().padding(top = 10.dp), contentAlignment = Alignment.Center) { Box(Modifier.size(32.dp, 4.dp).background(MaterialTheme.colorScheme.outline, CircleShape)) }
            Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(title, Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
                IconButton(onClick = close) { AppIcon(R.drawable.ic_x, "Close", Modifier.size(18.dp)) }
            }
            }
            CompositionLocalProvider(androidx.compose.foundation.LocalOverscrollFactory provides null) {
                Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(bottom = 12.dp), content = content)
            }
            footer?.let { HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant); Box(Modifier.fillMaxWidth().padding(16.dp)) { it() } }
        }
}

@Composable fun ZyraButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true,
    shape: androidx.compose.ui.graphics.Shape = RoundedCornerShape(12.dp), content: @Composable RowScope.() -> Unit) {
    Button(onClick, modifier.heightIn(min = 48.dp), enabled = enabled, shape = shape, contentPadding = PaddingValues(horizontal = 18.dp, vertical = 12.dp), content = content)
}
@Composable fun ZyraOutlinedButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true,
    shape: androidx.compose.ui.graphics.Shape = RoundedCornerShape(12.dp), content: @Composable RowScope.() -> Unit) {
    OutlinedButton(onClick, modifier.heightIn(min = 48.dp), enabled = enabled, shape = shape, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.onSurface), contentPadding = PaddingValues(horizontal = 18.dp, vertical = 12.dp), content = content)
}

