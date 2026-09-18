package com.caverock.androidsvg;
import java.lang.reflect.Proxy;
import org.junit.Test;
import static org.junit.Assert.*;
import org.xmlpull.v1.XmlPullParser;
import org.xmlpull.v1.XmlPullParserException;

public class ParserCompatibilityTest {
    private XmlPullParser parser(boolean rejectsSetting, boolean enabled, boolean[] setting) {
        return (XmlPullParser) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[] { XmlPullParser.class }, (proxy, method, args) -> {
            if (method.getName().equals("setFeature")) {
                assertEquals(XmlPullParser.FEATURE_PROCESS_DOCDECL, args[0]); assertEquals(false, args[1]); setting[0] = true;
                if (rejectsSetting) throw new XmlPullParserException("unsupported feature");
                return null;
            }
            if (method.getName().equals("getFeature")) return enabled;
            throw new AssertionError("Unexpected parser call " + method.getName());
        });
    }
    @Test public void disablesSupportedFeature() throws Exception {
        boolean[] setting = {false}; SVGParser.disableDocDeclarations(parser(false, true, setting)); assertTrue(setting[0]);
    }
    @Test public void permitsUnsupportedFeatureOnlyWhenAlreadyDisabled() throws Exception {
        SVGParser.disableDocDeclarations(parser(true, false, new boolean[] {false}));
    }
    @Test(expected = XmlPullParserException.class) public void cannotIgnoreEnabledDeclarations() throws Exception {
        SVGParser.disableDocDeclarations(parser(true, true, new boolean[] {false}));
    }
}
