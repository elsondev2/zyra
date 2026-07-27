using System.Drawing;
using System.IO;
using System.Drawing.Imaging;
using Zyra.ComputerUse.Windows;

namespace Zyra.ComputerUse.Capture;

/// <summary>
/// Selected-window capture boundary. The first implementation uses the Win32 PrintWindow
/// path so no desktop or unrelated window pixels can enter the sidecar. The opaque artifact
/// contract lets a Windows.Graphics.Capture frame source replace this provider without
/// changing broker or model contracts.
/// </summary>
public sealed class WindowsGraphicsCaptureProvider
{
    private readonly string _artifactDirectory;
    private readonly Queue<string> _artifacts = new();

    public WindowsGraphicsCaptureProvider(string artifactDirectory)
    {
        _artifactDirectory = artifactDirectory;
        Directory.CreateDirectory(_artifactDirectory);
        foreach (var file in Directory.EnumerateFiles(_artifactDirectory, "*.jpg"))
        {
            try { File.Delete(file); } catch { }
        }
    }

    public string CaptureSelectedWindow(WindowHandleEntry window)
    {
        if (!NativeMethods.GetWindowRect(window.Handle, out var rectangle)) throw new InvalidOperationException("Selected-window bounds are unavailable.");
        var width = Math.Clamp(rectangle.Right - rectangle.Left, 1, 3840);
        var height = Math.Clamp(rectangle.Bottom - rectangle.Top, 1, 2160);
        Directory.CreateDirectory(_artifactDirectory);
        using var bitmap = new Bitmap(width, height, PixelFormat.Format24bppRgb);
        using var graphics = Graphics.FromImage(bitmap);
        var hdc = graphics.GetHdc();
        try
        {
            if (!NativeMethods.PrintWindow(window.Handle, hdc, 2)) throw new InvalidOperationException("Selected-window capture was denied by the target.");
        }
        finally { graphics.ReleaseHdc(hdc); }
        var id = Guid.NewGuid().ToString("N");
        var file = Path.Combine(_artifactDirectory, $"{id}.jpg");
        bitmap.Save(file, ImageFormat.Jpeg);
        if (new FileInfo(file).Length > 2 * 1024 * 1024)
        {
            File.Delete(file);
            throw new InvalidOperationException("Selected-window screenshot exceeded the two MiB limit.");
        }
        _artifacts.Enqueue(file);
        while (_artifacts.Count > 20)
        {
            try { File.Delete(_artifacts.Dequeue()); } catch { }
        }
        return $"control-artifact:{id}";
    }

    public void Clear()
    {
        while (_artifacts.Count > 0) { try { File.Delete(_artifacts.Dequeue()); } catch { } }
    }
}
