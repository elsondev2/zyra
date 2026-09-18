package dev.zyra.mobile

import dev.zyra.mobile.data.MermaidPolicy
import org.junit.Assert.*
import org.junit.Test

class MermaidPolicyTest {
    private val svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 120 80\"><defs><marker id=\"arrow\"><path d=\"M0 0L5 5\"/></marker></defs><style>.edge{stroke:#123456;marker-end:url(#arrow)}</style><path d=\"M1 1L100 60\" class=\"edge\"/><text x=\"4\" y=\"20\">Ready</text></svg>"
    @Test fun boundedPlainChartIsAcceptedButConfigurationCannotOverrideTheTrustedRenderer() {
        MermaidPolicy.checkSource("flowchart LR\n A[Plan] --> B[Build]")
        listOf("%%{init: {'securityLevel':'loose'}}%%\nflowchart LR", "---\nconfig: {}\n---\nflowchart LR", "x".repeat(8001), "flowchart LR\n" + "A\n".repeat(501), "x\u0000y").forEach { assertTrue(it.take(80), runCatching { MermaidPolicy.checkSource(it) }.isFailure) }
    }
    @Test fun staticTextAndGeometryKeepLocalMarkerReferences() {
        val safe = MermaidPolicy.sanitizeSvg(svg)
        assertTrue(safe.contains("Ready")); assertTrue(safe.contains("url(#arrow)"))
        assertTrue(safe.contains("viewBox=\"0 0 120 80\""))
    }
    @Test fun executableEmbedsAndRemoteReferencesNeverReachTheNativeSvgParser() {
        val invalid = listOf(
            svg.replace("<text ", "<text onclick=\"evil()\" "),
            svg.replace("Ready</text>", "Ready</text><script>evil()</script>"),
            svg.replace("Ready</text>", "Ready</text><image href=\"https://example.com/p.png\"/>"),
            svg.replace("url(#arrow)", "url(https://example.com/paint.svg)"),
            svg.replace("url(#arrow)", "url(file:///private.svg)"),
            svg.replace("Ready</text>", "Ready</text><foreignObject><div>HTML</div></foreignObject>"),
            "<!DOCTYPE svg [<!ENTITY x SYSTEM 'file:///private'>]>" + svg,
            svg.replace("viewBox=\"0 0 120 80\"", "viewBox=\"0 0 Infinity 80\""),
            svg.replace("viewBox=\"0 0 120 80\"", "viewBox=\"0 0 30000 80\""),
            svg.replace(".edge{", "@import 'https://example.com/style.css';.edge{")
        )
        invalid.forEach { assertTrue(it.take(100), runCatching { MermaidPolicy.sanitizeSvg(it) }.isFailure) }
    }
}
