package com.termux.terminal;
import org.junit.Test;
import static org.junit.Assert.*;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;

public class RemoteSessionTest {
    @Test public void snapshotRestorationPreservesGeometryAndCannotWriteToTheHost() {
        ArrayList<String> sent = new ArrayList<>();
        TerminalSessionClient client = (TerminalSessionClient) Proxy.newProxyInstance(getClass().getClassLoader(), new Class[]{TerminalSessionClient.class}, (proxy, method, arguments) -> method.getName().equals("getTerminalCursorStyle") ? 0 : null);
        TerminalSession session = new TerminalSession(client, bytes -> sent.add(new String(bytes, StandardCharsets.UTF_8)));
        session.restore(100, 28, "\u001b[31mhello\u001b[0m\u001b[3;7Hworld\u001b[6n");
        assertTrue(sent.isEmpty());
        assertEquals(2, session.getEmulator().getCursorRow()); assertEquals(11, session.getEmulator().getCursorCol());
        session.updateSize(40, 18, 8, 16);
        assertEquals(100, session.getEmulator().mColumns); assertEquals(28, session.getEmulator().mRows);
        assertTrue(session.getEmulator().getScreen().getTranscriptText().contains("hello"));
        session.writeCodePoint(false, 0x1f600); assertEquals("😀", sent.get(0));
        session.append("\u001b[6n"); assertEquals("\u001b[3;12R", sent.get(1));
    }
    @Test public void escapeSequenceCannotReadThePhoneClipboard() {
        ArrayList<String> calls = new ArrayList<>();
        TerminalSessionClient client = (TerminalSessionClient) Proxy.newProxyInstance(getClass().getClassLoader(), new Class[]{TerminalSessionClient.class}, (proxy, method, arguments) -> {
            if (method.getName().contains("Clipboard")) calls.add(method.getName());
            return method.getName().equals("getTerminalCursorStyle") ? 0 : null;
        });
        TerminalSession session = new TerminalSession(client, bytes -> {});
        session.restore(80, 24, ""); session.append("\u001b]52;c;?\u0007");
        assertTrue(calls.isEmpty()); session.onPasteTextFromClipboard(); assertEquals(1, calls.size());
    }
}
