package dev.zyra.mobile.ui

import androidx.annotation.DrawableRes
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.size
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp

@Composable fun AppIcon(@DrawableRes id: Int, description: String? = null, modifier: Modifier = Modifier) {
    Icon(painterResource(id), description, modifier.size(21.dp))
}
