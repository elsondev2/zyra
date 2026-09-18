package dev.zyra.mobile.data

import org.json.JSONObject
import java.util.Locale

/** Same filename-first, compound extension and folder rules as Desktop's materialFileIconTheme. */
class DesktopFileIcons(private val manifest: JSONObject) {
    fun resolve(path: String, directory: Boolean = false, light: Boolean = false, expanded: Boolean = false, root: Boolean = false): String {
        val name = path.replace('\\', '/').substringAfterLast('/').lowercase(Locale.ROOT)
        fun mapped(group: String, key: String): String? =
            (if (light) manifest.optJSONObject("light")?.optJSONObject(group)?.optString(key)?.takeIf { it.isNotBlank() } else null)
                ?: manifest.optJSONObject(group)?.optString(key)?.takeIf { it.isNotBlank() }
        val definition = if (directory) {
            val suffix = if (expanded) "-open" else ""
            when (name) {
                ".zyra", "zyra-runtime", "zyra-browser-control-extension" -> "folder-app$suffix"
                ".zyra-worktrees" -> "folder-git$suffix"
                else -> {
                    val group = (if (root) "rootFolderNames" else "folderNames") + if (expanded) "Expanded" else ""
                    mapped(group, name) ?: manifest.getString((if (root) "rootFolder" else "folder") + if (expanded) "Expanded" else "")
                }
            }
        } else if (name == ".zyra" || name.endsWith(".zyra")) "robot"
        else mapped("fileNames", name) ?: name.split('.').let { parts ->
            (1 until parts.size).firstNotNullOfOrNull { mapped("fileExtensions", parts.drop(it).joinToString(".")) }
        } ?: manifest.getString("file")
        return manifest.getJSONObject("definitions").optString(definition, "file.svg")
    }
}
