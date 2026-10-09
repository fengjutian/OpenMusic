#include "smtc_bridge.h"

// Deliberately a stub.
//
// The SMTC interop requires WinRT COM smart pointers (wrl::ComPtr) and the
// Windows.Globalization.MediaPlaybackPlaybackStatus types. Wiring that in is a
// real task with real risk, and writing it blind — with no compiler to check it
// — would violate the technical spec's "不得伪造未验证的 API".
//
// Until it exists, `PlatformCapabilities.systemNowPlaying` is false on Windows
// (see src/platform/bridge.ts), and the UI does not claim the feature.

namespace openmusic {

void SmtcBridge::Initialize() {}

void SmtcBridge::Shutdown() {}

void SmtcBridge::SetCommandHandler(CommandHandler handler) { handler_ = std::move(handler); }

void SmtcBridge::UpdateMetadata(const TrackMetadata& /*metadata*/) {}

void SmtcBridge::SetPlaying(bool /*playing*/) {}

void SmtcBridge::SetPosition(std::int64_t /*position_ms*/) {}

}  // namespace openmusic