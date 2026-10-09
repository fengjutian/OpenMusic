// Window + keyboard shortcut routing.
//
// Product spec §18:
//   Space            play/pause
//   Ctrl+K           focus search
//   Ctrl+L           focus library
//   Ctrl+O           import
//   Ctrl+,           settings
//   "输入框聚焦时不得错误触发播放快捷键"
//
// The last rule is the reason routing is centralised here instead of being
// repeated per page: this is the only place that knows whether a text field
// currently has focus.

#pragma once

#include <windows.h>

#include <functional>
#include <string>

namespace openmusic {

class Window {
 public:
    using Command = std::function<void()>;

    enum class Shortcut {
        kNone,
        kPlayPause,
        kFocusSearch,
        kFocusLibrary,
        kImport,
        kSettings,
    };

    static Window& Instance();

    static LRESULT CALLBACK WndProcThunk(HWND hwnd, UINT msg, WPARAM wparam, LPARAM lparam);

    LRESULT HandleMessage(HWND hwnd, UINT msg, WPARAM wparam, LPARAM lparam);

    void Bind(Shortcut shortcut, Command command);
    void SetTextInputFocused(bool focused);

 private:
    Window() = default;

    Shortcut ResolveShortcut(WPARAM key, bool control_down) const;

    Command commands_[static_cast<int>(Shortcut::kSettings) + 1];
    bool text_input_focused_ = false;
    static constexpr int kMinWidth = 900;
    static constexpr int kMinHeight = 600;
};

}  // namespace openmusic