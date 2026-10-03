"""Inspect only the HWND supplied by the isolated Electron fixture."""
import ctypes
import json
import sys
from ctypes import wintypes

user32 = ctypes.WinDLL('user32', use_last_error=True)
hwnd = wintypes.HWND(int(sys.argv[1]))
user32.IsWindow.argtypes = [wintypes.HWND]
user32.IsWindowVisible.argtypes = [wintypes.HWND]
user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
user32.GetWindowLongPtrW.argtypes = [wintypes.HWND, ctypes.c_int]
user32.GetWindowLongPtrW.restype = ctypes.c_ssize_t
user32.SendMessageTimeoutW.argtypes = [wintypes.HWND, wintypes.UINT, ctypes.c_size_t, ctypes.c_ssize_t,
                                     wintypes.UINT, wintypes.UINT, ctypes.POINTER(ctypes.c_size_t)]
user32.SendMessageTimeoutW.restype = ctypes.c_ssize_t
if not user32.IsWindow(hwnd):
    raise RuntimeError('Fixture window no longer exists')
if user32.IsWindowVisible(hwnd):
    raise RuntimeError('Fixture must remain hidden')
rect = wintypes.RECT()
if not user32.GetWindowRect(hwnd, ctypes.byref(rect)):
    raise ctypes.WinError(ctypes.get_last_error())
style = user32.GetWindowLongPtrW(hwnd, -16)
hits = {}
for edge, x, y in [
    ('left', rect.left + 1, (rect.top + rect.bottom) // 2),
    ('right', rect.right - 2, (rect.top + rect.bottom) // 2),
    ('top', (rect.left + rect.right) // 2, rect.top + 1),
    ('bottom', (rect.left + rect.right) // 2, rect.bottom - 2),
]:
    result = ctypes.c_size_t()
    position = (x & 0xffff) | ((y & 0xffff) << 16)
    if not user32.SendMessageTimeoutW(hwnd, 0x0084, 0, position, 2, 2000, ctypes.byref(result)):
        raise RuntimeError('Fixture hit-test timed out')
    hits[edge] = result.value
print(json.dumps({'thickFrame': bool(style & 0x00040000), 'hits': hits, 'visible': False}))
