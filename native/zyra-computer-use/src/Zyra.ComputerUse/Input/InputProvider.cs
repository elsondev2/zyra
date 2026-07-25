using System.Runtime.InteropServices;
using Zyra.ComputerUse.Protocol;
using Zyra.ComputerUse.Windows;

namespace Zyra.ComputerUse.Input;

public sealed class InputProvider
{
    private volatile bool _stopped;
    public void Resume() => _stopped = false;
    public void EmergencyStop() => _stopped = true;

    public void Focus(WindowHandleEntry window)
    {
        ThrowIfStopped();
        if (!NativeMethods.SetForegroundWindow(window.Handle) || NativeMethods.GetForegroundWindow() != window.Handle)
            throw new InvalidOperationException("The selected window could not be focused.");
    }

    public void Click(WindowHandleEntry window, Bounds bounds)
    {
        Focus(window);
        ThrowIfStopped();
        var x = checked((int)Math.Round(bounds.X + bounds.Width / 2));
        var y = checked((int)Math.Round(bounds.Y + bounds.Height / 2));
        NativeMethods.SetCursorPos(x, y);
        NativeMethods.mouse_event(0x0002, 0, 0, 0, 0);
        NativeMethods.mouse_event(0x0004, 0, 0, 0, 0);
    }

    public void TypeText(WindowHandleEntry window, string text)
    {
        Focus(window);
        if (text.Length > 16_384) throw new InvalidOperationException("Typed text exceeds the sidecar limit.");
        foreach (var character in text)
        {
            ThrowIfStopped();
            var inputs = new[]
            {
                KeyInput(character, 0x0004),
                KeyInput(character, 0x0004 | 0x0002)
            };
            if (NativeMethods.SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<NativeMethods.Input>()) != inputs.Length)
                throw new InvalidOperationException("Windows rejected synthesized text input.");
        }
    }

    public void Key(WindowHandleEntry window, string key)
    {
        Focus(window);
        var virtualKey = key.ToUpperInvariant() switch
        {
            "ENTER" => (ushort)0x0D, "TAB" => (ushort)0x09, "ESCAPE" => (ushort)0x1B,
            "BACKSPACE" => (ushort)0x08, "DELETE" => (ushort)0x2E, "HOME" => (ushort)0x24,
            "END" => (ushort)0x23, "ARROWUP" => (ushort)0x26, "ARROWDOWN" => (ushort)0x28,
            "ARROWLEFT" => (ushort)0x25, "ARROWRIGHT" => (ushort)0x27,
            _ when key.Length == 1 => (ushort)char.ToUpperInvariant(key[0]),
            _ => throw new InvalidOperationException("The requested key is not in the bounded key allowlist.")
        };
        var inputs = new[] { VirtualKeyInput(virtualKey, 0), VirtualKeyInput(virtualKey, 0x0002) };
        if (NativeMethods.SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<NativeMethods.Input>()) != inputs.Length)
            throw new InvalidOperationException("Windows rejected synthesized key input.");
    }

    public void Scroll(WindowHandleEntry window, double deltaY)
    {
        Focus(window);
        ThrowIfStopped();
        var amount = (int)Math.Clamp(-deltaY, -10_000, 10_000);
        NativeMethods.mouse_event(0x0800, 0, 0, unchecked((uint)amount), 0);
    }

    private static NativeMethods.Input KeyInput(char character, uint flags) => new()
    {
        Type = 1,
        Data = new NativeMethods.InputUnion { Keyboard = new NativeMethods.KeyboardInput { VirtualKey = 0, ScanCode = character, Flags = flags } }
    };

    private static NativeMethods.Input VirtualKeyInput(ushort key, uint flags) => new()
    {
        Type = 1,
        Data = new NativeMethods.InputUnion { Keyboard = new NativeMethods.KeyboardInput { VirtualKey = key, ScanCode = 0, Flags = flags } }
    };

    private void ThrowIfStopped()
    {
        if (_stopped) throw new OperationCanceledException("Windows input stopped by emergency stop.");
    }
}
