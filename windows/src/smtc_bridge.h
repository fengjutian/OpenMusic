// System Media Transport Controls (SMTC) bridge.
//
// Product spec §18 requires the Windows shell to publish the current track and
// honour play/pause/next/previous from the OS. That is SMTC, not a Lynx feature.
//
// VERIFICATION STATUS: NOT COMPILED. The SMTC interop surface below is written
// against the documented WinRT shape; it must be built and exercised with a real
// media session before the UI advertises "系统媒体控制".
//
// Design note: SMTC wants COM/WinRT objects, which does not compose with a C++
// Lynx host without a small interop layer. That interop is the main engineering
// risk on the Windows side and is exactly what ADR-0001 asks us to measure
// before committing to ReactLynx for Windows.

#pragma once

#include <functional>
#include <string>
#include <vector>

namespace openmusic {

struct TrackMetadata {
    std::string title;
    std::string artist;
    std::string album;
    std::wstring album_art_path;  // local file path; empty when there is no art
};

enum class TransportCommand {
    kPlay,
    kPause,
    kNext,
    kPrevious,
};

class SmtcBridge {
 public:
    using CommandHandler = std::function<void(TransportCommand)>;

    static SmtcBridge& Instance();

    void Initialize();
    void Shutdown();

    void SetCommandHandler(CommandHandler handler);

    void UpdateMetadata(const TrackMetadata& metadata);
    void SetPlaying(bool playing);
    void SetPosition(std::int64_t position_ms);

 private:
    SmtcBridge() = default;

    // The real implementation holds COM smart pointers; they are declared in a
    // .cpp so this header stays free of <wrl.h>.
    struct Impl;
    Impl* impl_ = nullptr;
    CommandHandler handler_;
};

}  // namespace openmusic