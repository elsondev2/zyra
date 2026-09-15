package dev.zyra.mobile.ui;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.inputmethod.InputMethodManager;
import android.widget.HorizontalScrollView;
import android.widget.FrameLayout;
import android.widget.ScrollView;
import com.termux.terminal.TerminalSession;
import com.termux.terminal.TerminalSessionClient;
import com.termux.view.TerminalView;
import com.termux.view.TerminalViewClient;
import java.nio.charset.StandardCharsets;

/** Native VT renderer. The host retains terminal geometry; the phone can pan horizontally. */
public final class RemoteTerminalWidget extends HorizontalScrollView {
    public interface Send { void text(String text); }
    private final TerminalView view;
    private final ScrollView vertical;
    private final Send send;
    private TerminalSession session;
    private final Callbacks callbacks = new Callbacks();
    private final int fontSize;
    private boolean followingCursor = true;
    private float lineHeight;
    private int themeBackground = 0xff101418, themeForeground = 0xffeeeeee, themeCursor = 0xffeeeeee;
    public void theme(int background, int foreground, int cursor) {
        if (themeBackground == background && themeForeground == foreground && themeCursor == cursor) return;
        themeBackground = background; themeForeground = foreground; themeCursor = cursor;
        applyTheme();
    }
    private void applyTheme() {
        setBackgroundColor(themeBackground);
        if (session != null) {
            int[] colors = session.getEmulator().mColors.mCurrentColors;
            colors[com.termux.terminal.TextStyle.COLOR_INDEX_BACKGROUND] = themeBackground;
            colors[com.termux.terminal.TextStyle.COLOR_INDEX_FOREGROUND] = themeForeground;
            colors[com.termux.terminal.TextStyle.COLOR_INDEX_CURSOR] = themeCursor;
            view.invalidate();
        }
    }
    public RemoteTerminalWidget(Context context, Send send) {
        super(context); this.send = send;
        setFillViewport(true); setBackgroundColor(0xff101418);
        fontSize = Math.round(13 * context.getResources().getDisplayMetrics().scaledDensity);
        view = new TerminalView(context, null);
        view.setTerminalViewClient(callbacks); view.setTextSize(fontSize); view.setTypeface(Typeface.MONOSPACE);
        view.setFocusableInTouchMode(true);
        vertical = new ScrollView(context); vertical.setFillViewport(true);
        vertical.setOnTouchListener((v, event) -> { if (event.getActionMasked() == MotionEvent.ACTION_MOVE) followingCursor = false; return false; });
        vertical.addView(view, new FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
        addView(vertical, new FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
        setContentDescription("Shared PC terminal. Swipe sideways for wide output.");
    }
    public void frame(TerminalFrame frame) {
        if (frame.getCols() > 0) {
            session = new TerminalSession(callbacks, bytes -> { followCursor(); send.text(new String(bytes, StandardCharsets.UTF_8)); });
            session.restore(frame.getCols(), frame.getRows(), frame.getData());
            applyTheme();
            Paint paint = new Paint(); paint.setTypeface(Typeface.MONOSPACE); paint.setTextSize(fontSize);
            lineHeight = paint.getFontSpacing();
            vertical.getLayoutParams().width = Math.max(getWidth(), (int) Math.ceil(paint.measureText("X") * frame.getCols()) + 2);
            view.getLayoutParams().height = (int) Math.ceil(paint.getFontSpacing() * (frame.getRows() + 1));
            vertical.requestLayout();
            view.requestLayout(); view.attachSession(session); view.onScreenUpdated(); scrollToCursor();
        } else if (session != null) session.append(frame.getData());
    }
    public void keyboard() {
        followCursor();
        view.requestFocus(); ((InputMethodManager)getContext().getSystemService(Context.INPUT_METHOD_SERVICE)).showSoftInput(view, InputMethodManager.SHOW_IMPLICIT);
    }
    public void followCursor() {
        followingCursor = true;
        view.setTopRow(0);
        scrollToCursor();
    }
    private void scrollToCursor() {
        if (!followingCursor || session == null) return;
        vertical.post(() -> {
            if (!followingCursor || session == null) return;
            int bottom = (int) Math.ceil((session.getEmulator().getCursorRow() + 2) * lineHeight);
            int top = Math.max(0, bottom - (int) Math.ceil(2 * lineHeight));
            if (bottom > vertical.getScrollY() + vertical.getHeight()) vertical.scrollTo(0, Math.max(0, bottom - vertical.getHeight()));
            else if (top < vertical.getScrollY()) vertical.scrollTo(0, top);
        });
    }
    public void paste() {
        ClipboardManager clipboard = (ClipboardManager)getContext().getSystemService(Context.CLIPBOARD_SERVICE);
        ClipData clip = clipboard.getPrimaryClip();
        if (clip != null && clip.getItemCount() > 0 && session != null) {
            CharSequence value = clip.getItemAt(0).coerceToText(getContext());
            if (value != null && value.toString().getBytes(StandardCharsets.UTF_8).length <= 8000) session.getEmulator().paste(value.toString());
        }
    }
    private final class Callbacks implements TerminalSessionClient, TerminalViewClient {
        public void onTextChanged(TerminalSession s) { view.onScreenUpdated(); scrollToCursor(); }
        public void onTitleChanged(TerminalSession s) { }
        public void onSessionFinished(TerminalSession s) { }
        public void onCopyTextToClipboard(TerminalSession s, String text) { ((ClipboardManager)getContext().getSystemService(Context.CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("Terminal", text)); }
        public void onPasteTextFromClipboard(TerminalSession s) { paste(); }
        public void onBell(TerminalSession s) { }
        public void onColorsChanged(TerminalSession s) { view.invalidate(); }
        public void onTerminalCursorStateChange(boolean state) { }
        public Integer getTerminalCursorStyle() { return 0; }
        public float onScale(float scale) { return 1; }
        public void onSingleTapUp(MotionEvent e) { keyboard(); }
        public boolean shouldBackButtonBeMappedToEscape() { return false; }
        public boolean shouldEnforceCharBasedInput() { return false; }
        public boolean shouldUseCtrlSpaceWorkaround() { return false; }
        public boolean isTerminalViewSelected() { return view.hasFocus(); }
        public void copyModeChanged(boolean mode) { }
        public boolean onKeyDown(int code, KeyEvent event, TerminalSession s) { return false; }
        public boolean onKeyUp(int code, KeyEvent event) { return false; }
        public boolean onLongPress(MotionEvent event) { return false; }
        public boolean readControlKey() { return false; }
        public boolean readAltKey() { return false; }
        public boolean readShiftKey() { return false; }
        public boolean readFnKey() { return false; }
        public boolean onCodePoint(int codePoint, boolean ctrlDown, TerminalSession s) { return false; }
        public void onEmulatorSet() { }
        // Never put shell output, typed input, or clipboard contents into Android logs.
        public void logError(String tag, String message) { }
        public void logWarn(String tag, String message) { }
        public void logInfo(String tag, String message) { }
        public void logDebug(String tag, String message) { }
        public void logVerbose(String tag, String message) { }
        public void logStackTraceWithMessage(String tag, String message, Exception e) { }
        public void logStackTrace(String tag, Exception e) { }
    }
}
