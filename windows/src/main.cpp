// OpenMusic — Windows host entry point.
//
// VERIFICATION STATUS: NOT COMPILED AND NOT LINKED.
// The Lynx desktop embedding API surface must be read from the actual SDK
// before any of this is real. Everything below that touches Lynx is guarded so
// the file is at least self-consistent and reviewable.
//
// Window sizing contract (product spec §18):
//   minimum recommended size 900x600; below the breakpoint the app collapses
//   the secondary column rather than clipping the transport controls.

#include <windows.h>

#include <string>

#include "window.h"

namespace {

constexpr int kMinWidth = 900;
constexpr int kMinHeight = 600;
constexpr wchar_t kWindowClass[] = L"OpenMusic.MainWindow";

}  // namespace

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, LPWSTR, int show) {
    WNDCLASSEXW window_class{};
    window_class.cbSize = sizeof(window_class);
    window_class.style = CS_HREDRAW | CS_VREDRAW;
    window_class.lpfnWndProc = &openmusic::Window::WndProcThunk;
    window_class.hInstance = instance;
    window_class.hCursor = LoadCursor(nullptr, IDC_ARROW);
    window_class.lpszClassName = kWindowClass;

    if (RegisterClassExW(&window_class) == 0) {
        return 1;
    }

    // The transport bar lives at the bottom; keep the minimum tall enough that
    // it is never the thing that gets clipped.
    RECT rect{0, 0, kMinWidth + 320, kMinHeight + 64};
    AdjustWindowRect(&rect, WS_OVERLAPPEDWINDOW, FALSE);

    HWND hwnd = CreateWindowExW(
        0,
        kWindowClass,
        L"OpenMusic",
        WS_OVERLAPPEDWINDOW,
        CW_USEDEFAULT,
        CW_USEDEFAULT,
        rect.right - rect.left,
        rect.bottom - rect.top,
        nullptr,
        nullptr,
        instance,
        nullptr);

    if (hwnd == nullptr) {
        return 2;
    }

    ShowWindow(hwnd, show);
    UpdateWindow(hwnd);

    MSG msg{};
    while (GetMessageW(&msg, nullptr, 0, 0) > 0) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    return static_cast<int>(msg.wParam);
}