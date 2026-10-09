#include "window.h"

namespace openmusic {
namespace {

bool IsControlDown() { return (GetKeyState(VK_CONTROL) & 0x8000) != 0; }

}  // namespace

Window& Window::Instance() {
    static Window instance;
    return instance;
}

void Window::Bind(Shortcut shortcut, Command command) {
    commands_[static_cast<int>(shortcut)] = std::move(command);
}

void Window::SetTextInputFocused(bool focused) { text_input_focused_ = focused; }

Window::Shortcut Window::ResolveShortcut(WPARAM key, bool control_down) const {
    if (!control_down) {
        return key == VK_SPACE ? Shortcut::kPlayPause : Shortcut::kNone;
    }
    switch (key) {
        case 'K':
            return Shortcut::kFocusSearch;
        case 'L':
            return Shortcut::kFocusLibrary;
        case 'O':
            return Shortcut::kImport;
        case VK_OEM_COMMA:
            return Shortcut::kSettings;
        default:
            return Shortcut::kNone;
    }
}

LRESULT CALLBACK Window::WndProcThunk(HWND hwnd, UINT msg, WPARAM wparam, LPARAM lparam) {
    return Instance().HandleMessage(hwnd, msg, wparam, lparam);
}

LRESULT Window::HandleMessage(HWND hwnd, UINT msg, WPARAM wparam, LPARAM lparam) {
    switch (msg) {
        case WM_SIZE: {
            const int width = LOWORD(lparam);
            const int height = HIWORD(lparam);
            const bool too_small = width < kMinWidth || height < kMinHeight;
            // Never let the window shrink past the point where the transport
            // controls would be clipped.
            if (too_small && width > 0 && height > 0) {
                SetWindowPos(hwnd, nullptr, 0, 0, kMinWidth, kMinHeight,
                             SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE);
                return 0;
            }
            return 0;
        }

        case WM_GETMINMAXINFO: {
            auto* info = reinterpret_cast<MINMAXINFO*>(lparam);
            info->ptMinTrackSize.x = kMinWidth;
            info->ptMinTrackSize.y = kMinHeight;
            return 0;
        }

        case WM_CHAR: {
            // Typing in a field must never trigger playback shortcuts.
            SetTextInputFocused(true);
            break;
        }

        case WM_KILLFOCUS: {
            SetTextInputFocused(false);
            break;
        }

        case WM_KEYDOWN: {
            const bool text_focused = text_input_focused_;
            // Space is the only key that must be suppressed while typing; the
            // Ctrl chords are unambiguous.
            if (text_focused && wparam == VK_SPACE && !IsControlDown()) {
                return 0;
            }
            const Shortcut shortcut = ResolveShortcut(wparam, IsControlDown());
            if (shortcut != Shortcut::kNone && commands_[static_cast<int>(shortcut)]) {
                commands_[static_cast<int>(shortcut)]();
                return 0;
            }
            break;
        }

        case WM_CLOSE:
            // "关闭窗口行为可配置为退出或最小化到托盘" — the tray policy is not
            // implemented yet, so the window exits. Do not fake the toggle.
            DestroyWindow(hwnd);
            return 0;

        case WM_DESTROY:
            PostQuitMessage(0);
            return 0;
    }

    return DefWindowProcW(hwnd, msg, wparam, lparam);
}

}  // namespace openmusic