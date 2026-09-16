package dev.zyra.mobile.ui

import android.content.Context
import android.app.Activity
import androidx.core.view.WindowCompat
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.Font
import dev.zyra.mobile.R
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.zyra.mobile.data.Appearance
import org.json.JSONArray
import org.json.JSONObject

data class DesktopTheme(val id: String, val name: String, val dark: Boolean, val tokens: JSONObject) {
    fun color(key: String) = Color(android.graphics.Color.parseColor(tokens.getString(key)))
}
object DesktopThemes {
    private var cache: List<DesktopTheme>? = null
    fun load(context: Context): List<DesktopTheme> = cache ?: run {
        val json = JSONArray(context.assets.open("desktop-themes.json").bufferedReader().use { it.readText() })
        (0 until json.length()).map { json.getJSONObject(it).let { value -> DesktopTheme(value.getString("id"), value.getString("name"), value.getBoolean("dark"), value.getJSONObject("tokens")) } }.also { cache = it }
    }
}
val LocalReduceMotion = staticCompositionLocalOf { false }
val LocalMessageTimestamps = staticCompositionLocalOf { false }
val LocalThoughtProcesses = staticCompositionLocalOf { false }
val LocalActionCounts = staticCompositionLocalOf { false }
val LocalWorkDetails = staticCompositionLocalOf { true }
val LocalDesktopTheme = staticCompositionLocalOf<DesktopTheme?> { null }
private fun contrast(color: Color) = if (color.luminance() > 0.179f) Color.Black else Color.White
private val bricolage = FontFamily(Font(R.font.bricolage_400, FontWeight.Normal), Font(R.font.bricolage_500, FontWeight.Medium), Font(R.font.bricolage_600, FontWeight.SemiBold), Font(R.font.bricolage_700, FontWeight.Bold))
private val hanken = FontFamily(Font(R.font.hanken_400, FontWeight.Normal), Font(R.font.hanken_500, FontWeight.Medium), Font(R.font.hanken_600, FontWeight.SemiBold), Font(R.font.hanken_700, FontWeight.Bold))
@Composable fun ZyraTheme(appearance: Appearance = Appearance(), content: @Composable () -> Unit) {
    val themes = DesktopThemes.load(LocalContext.current)
    val dark = appearance.mode == "dark" || (appearance.mode == "system" && isSystemInDarkTheme())
    val context = LocalContext.current
    SideEffect { (context as? Activity)?.let { activity -> WindowCompat.getInsetsController(activity.window, activity.window.decorView).apply { isAppearanceLightStatusBars = !dark; isAppearanceLightNavigationBars = !dark } } }
    val selected = themes.find { it.id == (if (dark) appearance.dark else appearance.light) && it.dark == dark }
        ?: themes.first { it.id == if (dark) "vercel" else "paper-light" }
    val bg = selected.color("bg"); val card = selected.color("card"); val text = selected.color("text"); val primary = selected.color("primary")
    val base = if (dark) darkColorScheme() else lightColorScheme()
    val colors = base.copy(primary = primary, onPrimary = contrast(primary), primaryContainer = selected.color("accent"), onPrimaryContainer = text,
        secondary = selected.color("secondary"), onSecondary = contrast(selected.color("secondary")), secondaryContainer = card, onSecondaryContainer = text,
        tertiary = primary, background = bg, onBackground = text, surface = bg, onSurface = text,
        surfaceVariant = card, onSurfaceVariant = selected.color("textDarker"), surfaceTint = Color.Transparent,
        surfaceContainerLowest = bg, surfaceContainerLow = card, surfaceContainer = card, surfaceContainerHigh = card, surfaceContainerHighest = selected.color("accent"),
        outline = selected.color("borderSecondary"), outlineVariant = selected.color("border"))
    val baseline = Typography(
        headlineLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 30.sp, lineHeight = 36.sp, letterSpacing = (-0.7).sp),
        headlineMedium = TextStyle(fontSize = 26.sp, lineHeight = 32.sp, fontWeight = FontWeight.Medium, letterSpacing = (-0.5).sp),
        headlineSmall = TextStyle(fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.Medium),
        titleLarge = TextStyle(fontSize = 20.sp, lineHeight = 26.sp, fontWeight = FontWeight.Medium, letterSpacing = (-0.4).sp),
        titleMedium = TextStyle(fontSize = 16.sp, lineHeight = 22.sp, fontWeight = FontWeight.Medium),
        bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 24.sp), bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 21.sp),
        bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 18.sp), labelLarge = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium),
        labelMedium = TextStyle(fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium), labelSmall = TextStyle(fontSize = 11.sp, lineHeight = 16.sp))
    val family = when (appearance.font) { "hanken" -> hanken; "system" -> FontFamily.SansSerif; else -> bricolage }
    val typography = baseline.copy(
        displayLarge = baseline.displayLarge.copy(fontFamily = family),
        displayMedium = baseline.displayMedium.copy(fontFamily = family),
        displaySmall = baseline.displaySmall.copy(fontFamily = family),
        headlineLarge = baseline.headlineLarge.copy(fontFamily = family),
        headlineMedium = baseline.headlineMedium.copy(fontFamily = family),
        headlineSmall = baseline.headlineSmall.copy(fontFamily = family),
        titleLarge = baseline.titleLarge.copy(fontFamily = family),
        titleMedium = baseline.titleMedium.copy(fontFamily = family),
        titleSmall = baseline.titleSmall.copy(fontFamily = family),
        bodyLarge = baseline.bodyLarge.copy(fontFamily = family),
        bodyMedium = baseline.bodyMedium.copy(fontFamily = family),
        bodySmall = baseline.bodySmall.copy(fontFamily = family),
        labelLarge = baseline.labelLarge.copy(fontFamily = family),
        labelMedium = baseline.labelMedium.copy(fontFamily = family),
        labelSmall = baseline.labelSmall.copy(fontFamily = family)
    )
    CompositionLocalProvider(LocalDesktopTheme provides selected, LocalReduceMotion provides appearance.reduceMotion,
        LocalMessageTimestamps provides appearance.timestamps, LocalWorkDetails provides appearance.workDetails, LocalActionCounts provides appearance.actionCounts, LocalThoughtProcesses provides appearance.thoughtProcesses) {
        MaterialTheme(colorScheme = colors, typography = typography, shapes = Shapes(extraSmall = RoundedCornerShape(4.dp), small = RoundedCornerShape(8.dp), medium = RoundedCornerShape(12.dp), large = RoundedCornerShape(16.dp), extraLarge = RoundedCornerShape(24.dp)), content = content)
    }
}

