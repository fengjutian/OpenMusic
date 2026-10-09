// File / folder picker for Windows import.
//
// Product spec §18: "支持拖入音频文件或文件夹、右键菜单、滚轮、悬停提示和系统文件选择器".
//
// VERIFICATION STATUS: NOT COMPILED. The IFileOpenDialog call sequence below
// matches the documented Shell Item API, but drag-and-drop (IDropTarget) and
// thumbnail previews are not implemented yet.
//
// Consequence in the product: `PlatformCapabilities.fileImport` is false, so
// the "导入文件夹" row is rendered as an explicit disabled entry rather than a
// button that does nothing (product spec §13).

#pragma once

#include <functional>
#include <string>
#include <vector>

namespace openmusic {

class FilePicker {
 public:
    using Callback = std::function<void(const std::vector<std::wstring>& paths)>;

    static FilePicker& Instance();

    /** Modal folder picker (FOS_PICKFOLDERS). */
    void PickFolders(HWND owner, Callback on_done);

    /** Modal file picker restricted to audio extensions. */
    void PickFiles(HWND owner, Callback on_done);

 private:
    FilePicker() = default;

    void RunDialog(HWND owner, bool folders, Callback on_done);
};

}  // namespace openmusic