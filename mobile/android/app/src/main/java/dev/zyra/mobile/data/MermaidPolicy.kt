package dev.zyra.mobile.data

import org.jsoup.Jsoup
import org.jsoup.nodes.Element
import org.jsoup.nodes.XmlDeclaration
import org.jsoup.nodes.DocumentType
import org.jsoup.parser.Parser

object MermaidPolicy {
    const val MAX_SOURCE = 8000
    const val MAX_SVG = 640_000
    private val tags = setOf("svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "defs", "symbol", "lineargradient", "radialgradient", "stop", "title", "desc", "text", "tspan", "textpath", "marker", "clippath", "style")
    private val url = Regex("url\\s*\\(([^)]*)\\)", RegexOption.IGNORE_CASE)
    fun checkSource(source: String) {
        require(source.isNotBlank() && source.length <= MAX_SOURCE && source.count { it == '\n' } <= 500) { "Diagram is too large to preview." }
        require(!source.trimStart().removePrefix("\uFEFF").trimStart().startsWith("---") && !Regex("%%\\s*\\{").containsMatchIn(source)) { "Diagram configuration is not supported." }
        require(!source.contains('\u0000')) { "Invalid diagram." }
    }
    private fun safeCss(value: String): Boolean {
        if (value.contains('\\') || value.contains('@') || value.contains("expression", true)) return false
        return url.findAll(value).all { Regex("['\"]?#[A-Za-z0-9_.:-]+['\"]?").matches(it.groupValues[1].trim()) }
    }
    /** Preserve only static geometry/text/local paint references from the trusted runtime's output. */
    fun sanitizeSvg(source: String): String {
        require(source.length <= MAX_SVG && !source.contains("<!DOCTYPE", true) && !source.contains("<!ENTITY", true)) { "Invalid diagram image." }
        val document = Jsoup.parse(source, "", Parser.xmlParser())
        require(document.childNodes().none { it is XmlDeclaration || it is DocumentType })
        val svg = document.children().singleOrNull()?.takeIf { it.normalName() == "svg" } ?: error("Invalid SVG root")
        var count = 0
        fun clean(element: Element, depth: Int) {
            require(++count <= 6000 && depth <= 64) { "Diagram image is too complex." }
            require(element.normalName() in tags) { "Unsupported diagram image element." }
            require(element.attributes().none { it.key.startsWith("on", true) || it.key.equals("href", true) || it.key.equals("xlink:href", true) }) { "Interactive image references are not allowed." }
            element.attributes().asList().forEach { attribute ->
                val key = attribute.key.lowercase()
                if (key == "style") require(safeCss(attribute.value))
                if (attribute.value.contains("url", true)) require(safeCss(attribute.value))
                require(key !in setOf("filter", "mask"))
            }
            if (element.normalName() == "style") require(safeCss(element.data().ifBlank { element.wholeText() }))
            element.children().forEach { clean(it, depth + 1) }
        }
        clean(svg, 0)
        val dimensions = svg.attr("viewBox").trim().split(Regex("[ ,]+"))
        require(dimensions.size == 4 && dimensions.all { it.toDoubleOrNull()?.isFinite() == true })
        val width = dimensions[2].toDouble(); val height = dimensions[3].toDouble()
        require(width > 0 && height > 0 && width <= 20_000 && height <= 20_000) { "Diagram dimensions are too large." }
        document.outputSettings().prettyPrint(false)
        return svg.outerHtml().also { require(it.length <= MAX_SVG) }
    }
}

