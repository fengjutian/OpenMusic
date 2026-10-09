# Windows 宿主（OpenMusic）

> **验证状态：未编译。** 本仓库的开发机没有 MSVC 工具链，
> `windows/` 下的代码**没有经过一次 CMake 构建或链接**。
> 详见 [`../docs/platform-capability-matrix.md`](../docs/platform-capability-matrix.md)。

## 这个目录负责什么

Windows 平台的呈现层与系统集成，对应 `src/ui/windows/WindowsShell.tsx`
（左侧导航 + 主内容 + 常驻播放条）与 `src/domain/ports.ts` 的平台端口。

| 端口（TS） | Windows 实现 | 状态 |
|---|---|---|
| 窗口尺寸 / 断点 | `Window::HandleMessage` `WM_SIZE` / `WM_GETMINMAXINFO` | 未编译 |
| 键盘快捷键 | `Window::ResolveShortcut`，集中路由 | 未编译 |
| 目录 / 文件选择 | `FilePicker`（`IFileOpenDialog`） | 未编译 + 未真机验证 |
| 系统媒体控制（SMTC） | `SmtcBridge` | **有意留空**，见下 |
| 拖放导入 | 未实现 | 未实现 |
| 任务栏 / 托盘 | 未实现 | 未实现 |

## 故意留空的两处，以及为什么

**`SmtcBridge` 是空实现。** SMTC 需要 WinRT/COM 互操作层（`wrl::ComPtr` 等），
在没有编译器的情况下写出一份"看起来对"的互操作代码，正是技术需求 §17 明令禁止的
"伪造未验证的 API"。在它真正接上之前，`PlatformCapabilities.systemNowPlaying` 为
`false`，界面不会声称支持系统媒体控制。

**Lynx 桌面嵌入方式未选定。** Lynx 3.7 起 macOS/Windows 成为一级平台，但元素属性
覆盖率目前只有 73%（246 项中 179 项），且仍在扩展中。选哪条路线属于架构决策，
见 [`../docs/adr/0001-windows-presentation-layer.md`](../docs/adr/0001-windows-presentation-layer.md)。

## 本地构建步骤

前置：Visual Studio 2022（Desktop C++）、CMake 3.20+、Lynx 源码树。

```powershell
# 1. 先产出 JS bundle
cd ..
npm install
npm run build:windows         # OPENMUSIC_PLATFORM=windows

# 2. 编译原生壳
cd windows
cmake -S . -B build -DOPENMUSIC_LYNX_VENDOR=<path-to-lynx-source>
cmake --build build --config Release
```

CMake 在未设置 `OPENMUSIC_LYNX_VENDOR` 时会直接报错停止，而不是猜一个路径。

## 上线前必须完成的验证

1. **Lynx 嵌入 API** — 逐个确认 `LynxEngine` / `LynxView` 的桌面端构造与生命周期。
2. **窗口缩放 / 多显示器 / 缩放比例** — 布局在 900×600 与 4K 150% 下都必须可用。
3. **SMTC** — 真实媒体会话下任务栏显示与按键往返。
4. **文件选择器** — 含网络盘、可移动盘、超长路径。
5. **关闭行为** — 退出 vs 最小化到托盘，首次触发时要解释当前设置。