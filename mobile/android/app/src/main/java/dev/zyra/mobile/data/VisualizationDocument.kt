package dev.zyra.mobile.data

import org.jsoup.Jsoup
import org.jsoup.safety.Cleaner
import org.jsoup.safety.Safelist

object VisualizationDocument {
    const val CSP = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
    private val tags = arrayOf("style", "div", "span", "p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "header", "footer", "main", "figure", "figcaption", "strong", "em", "b", "i", "small", "sub", "sup", "code", "pre", "ul", "ol", "li", "dl", "dt", "dd", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col", "details", "summary", "a", "img", "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "defs", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "pattern", "title", "desc", "use")
    private val attributes = arrayOf("id", "class", "style", "title", "role", "alt", "src", "href", "width", "height", "viewBox", "preserveAspectRatio", "d", "x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry", "points", "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "opacity", "transform", "text-anchor", "dominant-baseline", "font-size", "font-family", "font-weight", "offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform", "clip-path", "clipPathUnits", "mask", "patternUnits", "patternTransform", "colspan", "rowspan", "scope", "open")
    private val cache = object : LinkedHashMap<String, String>(16, .75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, String>?) = size > 12
    }
    @Synchronized fun sanitize(html: String): String = cache.getOrPut(html.take(65536)) {
        val input = Jsoup.parseBodyFragment(html.take(65536))
        input.select("script,iframe,object,embed,form,input,button,textarea,select,link,meta,base,foreignObject").remove()
        for (node in input.select("[href],[src]")) {
            if (node.hasAttr("href") && !node.attr("href").startsWith("#")) node.removeAttr("href")
            if (node.hasAttr("src") && !Regex("^data:image/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\\s]+$", RegexOption.IGNORE_CASE).matches(node.attr("src"))) node.removeAttr("src")
        }
        val safe = Safelist().addTags(*tags).addAttributes(":all", *attributes)
        // Jsoup normalizes HTML tag names; include SVG aliases then restore case-sensitive names.
        safe.addTags(*tags.map { it.lowercase() }.toTypedArray()).addAttributes(":all", *attributes.map { it.lowercase() }.toTypedArray())
        var result = Cleaner(safe).clean(input).outputSettings(org.jsoup.nodes.Document.OutputSettings().prettyPrint(false)).body().html()
        for (name in tags + attributes) if (name != name.lowercase()) {
            result = result.replace(Regex("(?<=<)" + name.lowercase() + "(?=[ >])"), name)
                .replace("</" + name.lowercase() + ">", "</" + name + ">")
                .replace(" " + name.lowercase() + "=", " " + name + "=")
        }
        result
    }
    fun build(html: String, background: String, text: String, muted: String, accent: String, border: String): String {
        fun color(value: String) = value.takeIf { Regex("#[0-9a-fA-F]{6}").matches(it) } ?: "#808080"
        return """<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="$CSP"><style>:root{--viz-bg:${color(background)};--viz-text:${color(text)};--viz-muted:${color(muted)};--viz-accent:${color(accent)};--viz-border:${color(border)}}*{box-sizing:border-box}html,body{margin:0;padding:0;background:transparent;color:var(--viz-text);font:14px/1.5 system-ui;overflow-wrap:anywhere}svg,img{max-width:100%;height:auto}table{border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid var(--viz-border);text-align:left}a{color:var(--viz-accent)}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}</style></head><body>${sanitize(html)}</body></html>"""
    }
}
