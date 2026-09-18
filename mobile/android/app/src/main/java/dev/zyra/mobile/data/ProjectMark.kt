package dev.zyra.mobile.data

import org.json.JSONObject
import java.io.StringReader
import javax.xml.parsers.SAXParserFactory
import org.xml.sax.Attributes
import org.xml.sax.InputSource
import org.xml.sax.helpers.DefaultHandler

data class ProjectMark(val encoded: String = "", val mime: String = "image/png", val slug: String = "", val color: String = "",
    val name: String = "", val projectId: String = "", val preferred: Boolean = false) {
    companion object {
        fun parse(value: JSONObject): ProjectMark {
            fun text(key: String) = value.opt(key) as? String ?: ""
            return ProjectMark(text("icon").takeIf { it.length <= 24000 }.orEmpty(),
                if (text("iconMime") == "image/svg+xml") "image/svg+xml" else "image/png",
                text("iconSlug").takeIf { Regex("[a-z0-9]{1,40}").matches(it) }.orEmpty(),
                text("color").takeIf { Regex("#[a-fA-F0-9]{6}").matches(it) }.orEmpty(),
                text("name").trim().take(240), text("projectId").take(256), value.optBoolean("preferred", false))
        }
    }
}

fun displayProjectName(path: String, mark: ProjectMark? = null): String {
    val name = mark?.name?.takeIf { it.isNotBlank() }
        ?: path.trimEnd('/', '\\').substringAfterLast('\\').substringAfterLast('/')
    return if (name.isBlank() || Regex("project_[a-f0-9-]+", RegexOption.IGNORE_CASE).matches(name)) "Saved project" else name
}

/** Group only aliases of the same saved project. Never merge unrelated projects by name. */
fun projectChoices(paths: List<String>, artwork: (String) -> ProjectMark?): List<String> {
    val groups = paths.distinct().groupBy { path -> artwork(path)?.projectId?.takeIf { it.isNotBlank() }?.let { "id:$it" } ?: "path:$path" }
    return groups.values.map { aliases -> aliases.find { artwork(it)?.preferred == true } ?: aliases.first() }
}

/** Only bounded, static geometry and non-recursive gradients are accepted from a project. */
fun safeProjectSvg(source: String): Boolean = runCatching {
    require(source.toByteArray(Charsets.UTF_8).size <= 16384)
    require(!Regex("<!\\s*(DOCTYPE|ENTITY)", RegexOption.IGNORE_CASE).containsMatchIn(source))
    val tags = setOf("svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "defs", "linearGradient", "radialGradient", "stop", "title", "desc")
    val gradients = mutableSetOf<String>(); val refs = mutableSetOf<String>(); val ids = mutableSetOf<String>()
    var depth = 0; var count = 0
    val handler = object : DefaultHandler() {
        override fun resolveEntity(publicId: String?, systemId: String?) = InputSource(StringReader(""))
        override fun startElement(uri: String?, localName: String?, qName: String?, attributes: Attributes) {
            val tag = localName?.takeIf { it.isNotEmpty() } ?: qName.orEmpty()
            require(tag in tags && (uri.isNullOrEmpty() || uri == "http://www.w3.org/2000/svg"))
            require(++depth <= 16 && ++count <= 512)
            if (count == 1) require(tag == "svg")
            for (i in 0 until attributes.length) {
                val key = attributes.getLocalName(i).ifEmpty { attributes.getQName(i) }
                val value = attributes.getValue(i)
                require(!key.startsWith("on", true) && key.lowercase() !in setOf("href", "style", "filter", "mask", "clip-path"))
                if (key == "id") { require(ids.add(value)); if (tag.endsWith("Gradient")) gradients.add(value) }
                if (value.contains("url", true)) {
                    val ref = Regex("url\\(#[a-zA-Z0-9_-]+\\)").matchEntire(value)?.value ?: error("External reference")
                    require(key == "fill" || key == "stroke")
                    refs.add(ref.substring(5, ref.length - 1))
                }
            }
        }
        override fun endElement(uri: String?, localName: String?, qName: String?) { depth-- }
        override fun processingInstruction(target: String?, data: String?) { error("Processing instruction") }
    }
    SAXParserFactory.newInstance().apply { isNamespaceAware = true }.newSAXParser().parse(InputSource(StringReader(source)), handler)
    require(count > 0 && depth == 0 && refs.all { it in gradients })
    true
}.getOrDefault(false)
