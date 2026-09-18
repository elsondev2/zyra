package dev.zyra.mobile
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.android.tools.screenshot.PreviewTest
import dev.zyra.mobile.data.*
import dev.zyra.mobile.ui.*

@PreviewTest @Preview(widthDp=360,heightDp=540)
@Composable fun SettingsDark038() = SettingsReview038("dark")
@PreviewTest @Preview(widthDp=320,heightDp=600,fontScale=1.3f)
@Composable fun SettingsLight038() = SettingsReview038("light")
@Composable private fun SettingsReview038(mode: String) {
    ZyraTheme(Appearance(mode=mode)) { Surface { Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical=20.dp), verticalArrangement=Arrangement.spacedBy(18.dp)) {
        Text("Chat settings", style=MaterialTheme.typography.titleLarge)
        ChatSettingsContent(ChatConfiguration(), ChatPreferencesState(loaded=true, memoryMode="enabled", profile="concise"), true, {}, {}, {}, {}, {_,_->})
        Text("Notifications", style=MaterialTheme.typography.titleMedium)
        ZyraSettingRow(R.drawable.ic_bell, "Chat notifications", "Replies and requests from connected computers", trailing={ZyraSwitch(true,{})})
    } } }
}
