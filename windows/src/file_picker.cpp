#include "file_picker.h"

#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <shobjidl_core.h>

namespace openmusic {
namespace {

constexpr const wchar_t kAudioFilter[] =
    L"音频文件\0*.mp3;*.m4a;*.aac;*.flac;*.ogg;*.wav;*.opus\0所有文件\0*.*\0\0";

}  // namespace

FilePicker& FilePicker::Instance() {
    static FilePicker instance;
    return instance;
}

void FilePicker::PickFolders(HWND owner, Callback on_done) { RunDialog(owner, true, std::move(on_done)); }

void FilePicker::PickFiles(HWND owner, Callback on_done) { RunDialog(owner, false, std::move(on_done)); }

void FilePicker::RunDialog(HWND owner, bool folders, Callback on_done) {
    IFileOpenDialog* dialog = nullptr;
    HRESULT hr = CoCreateInstance(CLSID_FileOpenDialog, nullptr, CLSCTX_INPROC_SERVER,
                                  IID_PPV_ARGS(&dialog));
    if (FAILED(hr)) {
        return;
    }

    FILEOPENDIALOGOPTIONS options = 0;
    dialog->GetOptions(&options);
    options |= FOS_FORCEFILESYSTEM | FOS_FILEMUSTEXIST;
    if (folders) {
        options |= FOS_PICKFOLDERS;
    }
    dialog->SetOptions(options);
    dialog->SetTitle(L"选择音乐文件夹");
    if (!folders) {
        dialog->SetFileTypes(L"audio", kAudioFilter);
    }

    // A cancelled dialog is a normal outcome, not an error to surface.
    hr = dialog->Show(owner);
    if (SUCCEEDED(hr)) {
        IShellItem* item = nullptr;
        if (SUCCEEDED(dialog->GetResult(&item)) && item != nullptr) {
            PWSTR path = nullptr;
            if (SUCCEEDED(item->GetDisplayName(SIGDN_FILESYSPATH, &path)) && path != nullptr) {
                on_done({std::wstring(path)});
                CoTaskMemFree(path);
            }
            item->Release();
        }
    }

    dialog->Release();
}

}  // namespace openmusic