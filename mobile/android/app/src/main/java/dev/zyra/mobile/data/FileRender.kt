package dev.zyra.mobile.data

enum class FileRender { MARKDOWN, WEB }
fun fileRender(path: String): FileRender? = when (path.substringAfterLast('.').lowercase()) {
    "md", "markdown" -> FileRender.MARKDOWN
    "html", "htm", "svg" -> FileRender.WEB
    else -> null
}

/** A self-contained document. Embedded styles/images may render; no scripts or remote resources. */
fun staticPreviewDocument(content: String): String {
    require(content.toByteArray(Charsets.UTF_8).size <= 131072)
    return """<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; form-action 'none'; base-uri 'none'"><style>body{margin:16px;overflow-wrap:anywhere}img,svg{max-width:100%;height:auto}pre{white-space:pre-wrap}</style></head><body>""" + content + "</body></html>"
}
