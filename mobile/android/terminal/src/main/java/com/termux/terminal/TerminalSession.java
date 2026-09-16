package com.termux.terminal;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** Zyra remote session adapter for the Apache-licensed Termux terminal view. No local PTY or JNI. */
public final class TerminalSession extends TerminalOutput {
    public interface RemoteOutput { void write(byte[] bytes); }
    public final String mHandle = UUID.randomUUID().toString();
    public String mSessionName;
    private TerminalEmulator emulator;
    private final TerminalSessionClient client;
    private final RemoteOutput output;
    private boolean running = true;
    private boolean restoring = false;
    private int viewportColumns = 80, viewportRows = 24;
    private final TerminalOutput remote = new TerminalOutput() {
        public void write(byte[] data, int offset, int count) { if (!restoring) TerminalSession.this.write(data, offset, count); }
        public void titleChanged(String oldTitle, String newTitle) { TerminalSession.this.titleChanged(oldTitle, newTitle); }
        // Escape-sequence clipboard access is deliberately separate from user copy/paste actions.
        public void onCopyTextToClipboard(String text) { }
        public void onPasteTextFromClipboard() { }
        public void onBell() { TerminalSession.this.onBell(); }
        public void onColorsChanged() { TerminalSession.this.onColorsChanged(); }
    };
    public TerminalSession(TerminalSessionClient client, RemoteOutput output) { this.client = client; this.output = output; }
    public void restore(int columns, int rows, String screen) {
        restoring = true;
        try {
            emulator = new TerminalEmulator(remote, columns, rows, 0, 0, 1000, client);
            byte[] bytes = screen.getBytes(StandardCharsets.UTF_8); emulator.append(bytes, bytes.length);
        } finally { restoring = false; }
        client.onTextChanged(this);
    }
    public void append(String text) {
        if (emulator == null) return;
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8); emulator.append(bytes, bytes.length); client.onTextChanged(this);
    }
    public void updateSize(int columns, int rows, int cellWidth, int cellHeight) {
        viewportColumns = columns; viewportRows = rows;
        if (emulator == null) emulator = new TerminalEmulator(remote, columns, rows, cellWidth, cellHeight, 1000, client);
        // The PC owns terminal geometry. Viewing on another screen cannot silently resize its process.
    }
    public int getViewportColumns() { return viewportColumns; }
    public int getViewportRows() { return viewportRows; }
    public void setRemoteSize(int columns, int rows) { if (emulator != null) { emulator.resize(columns, rows, 0, 0); client.onTextChanged(this); } }
    public TerminalEmulator getEmulator() { return emulator; }
    public String getTitle() { return emulator == null ? null : emulator.getTitle(); }
    public boolean isRunning() { return running; }
    public void setRunning(boolean value) { running = value; }
    public void write(byte[] data, int offset, int count) {
        if (!running || restoring || count <= 0) return;
        byte[] bytes = java.util.Arrays.copyOfRange(data, offset, offset + count); output.write(bytes);
    }
    public void writeCodePoint(boolean prependEscape, int codePoint) {
        if (!Character.isValidCodePoint(codePoint) || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return;
        write((prependEscape ? "\u001b" : "") + new String(Character.toChars(codePoint)));
    }
    public void titleChanged(String oldTitle, String newTitle) { client.onTitleChanged(this); }
    public void onCopyTextToClipboard(String text) { client.onCopyTextToClipboard(this, text); }
    public void onPasteTextFromClipboard() { client.onPasteTextFromClipboard(this); }
    public void onBell() { if (!restoring) client.onBell(this); }
    public void onColorsChanged() { client.onColorsChanged(this); }
    public void reset() { if (emulator != null) { emulator.reset(); client.onTextChanged(this); } }
}
