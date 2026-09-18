package dev.zyra.mobile

import dev.zyra.mobile.data.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ProjectMarkTest {
    @Test fun namesSurviveWithoutIconsAndOpaqueIdsStayPrivate() {
        val mark = ProjectMark.parse(JSONObject().put("name", "My app").put("projectId", "one").put("preferred", true))
        assertEquals("My app", displayProjectName("C:/projects/project_abcdef", mark))
        assertEquals("Saved project", displayProjectName("C:/projects/project_abcdef"))
        assertEquals("source", displayProjectName("C:\\projects\\source\\"))
        assertEquals("one", mark.projectId); assertTrue(mark.preferred)
    }
    @Test fun aliasesMergeByIdentityOnlyAndOnlyAmongVisiblePaths() {
        val marks = mapOf("home" to ProjectMark(name = "Same", projectId = "one", preferred = true),
            "source" to ProjectMark(name = "Same", projectId = "one"), "other" to ProjectMark(name = "Same", projectId = "two"))
        assertEquals(listOf("home", "other", "legacy"), projectChoices(listOf("source", "home", "other", "legacy", "legacy"), marks::get))
        assertEquals(listOf("source", "other"), projectChoices(listOf("source", "other"), marks::get))
    }
    @Test fun legacyRasterAndBoundedMetadata() {
        assertEquals("image/png", ProjectMark.parse(JSONObject().put("icon", "abc")).mime)
        assertEquals("react", ProjectMark.parse(JSONObject().put("iconSlug", "react")).slug)
        val invalid = ProjectMark.parse(JSONObject().put("icon", "a".repeat(24001)).put("iconSlug", "../../private").put("color", "url(secret)"))
        assertEquals("", invalid.encoded); assertEquals("", invalid.slug); assertEquals("", invalid.color)
    }
    @Test fun geometryAndLocalGradientsAreAccepted() {
        assertTrue(safeProjectSvg("""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="a"><stop offset="0" stop-color="#123456"/></linearGradient></defs><path fill="url(#a)" d="M0 0L24 24"/></svg>"""))
        assertTrue(safeProjectSvg("""<?xml version="1.0"?><svg width="24" height="24"><title>A &amp; B</title><circle cx="12" cy="12" r="4" fill="red"/></svg>"""))
    }
    @Test fun externalDocumentsCodeAndRecursiveArtworkAreRejected() {
        listOf("<script/>", "<use href='#a'/>", "<image href='https://example.com'/>", "<foreignObject/>", "<path onload='run()'/>", "<path style='fill:red'/>", "<path fill='url(https://example.com)'/>", "<path fill='url(#missing)'/>", "<linearGradient href='#self' id='self'/>").forEach {
            assertFalse(it, safeProjectSvg("<svg>$it</svg>"))
        }
        assertFalse(safeProjectSvg("""<!DOCTYPE svg [<!ENTITY a SYSTEM "file:///secret">]><svg>&a;</svg>"""))
        assertFalse(safeProjectSvg("<?xml-stylesheet href='https://example.com'?><svg/>"))
        assertFalse(safeProjectSvg("<svg><path id='same'/><path id='same'/></svg>"))
    }
    @Test fun malformedOrExcessiveGeometryIsBounded() {
        assertFalse(safeProjectSvg("<svg>")); assertFalse(safeProjectSvg("<path/>"))
        assertFalse(safeProjectSvg("<svg>" + "<g>".repeat(17) + "</g>".repeat(17) + "</svg>"))
        assertFalse(safeProjectSvg("<svg>" + "<path/>".repeat(513) + "</svg>"))
        assertFalse(safeProjectSvg("<svg><title>" + "x".repeat(16384) + "</title></svg>"))
    }
}
