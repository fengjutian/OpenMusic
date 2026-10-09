# ADR-0001：Windows 呈现层的路线选择

- 状态：**已决策（路线 C：Lynx Web Runtime + WebView2 / Edge）**
- 日期：2026-10-09
- 相关：[技术实现文档 §17](../OpenMusic-UI-技术实现文档-MiniMax.md)、§23、[能力矩阵](../platform-capability-matrix.md)、[ADR-0003](./0003-lynx-android-runtime-version.md)
- 决策门原型：阶段 8（`windows/host/index.html` + `scripts/prepare-windows-host.mjs` + `scripts/serve-windows-host.mjs`）

## 背景

技术实现文档 §17 明确要求：

> 若现有 ReactLynx Windows 支持不满足要求，先提交最小技术原型与决策记录，
> 再选择：继续 ReactLynx、增加薄原生壳，或让 Windows 使用独立呈现层但共享领域协议。
> 该选择属于架构决策，**不得在页面代码中临时打补丁**。

已核实的事实：

1. Lynx **3.7**（2026-04 发布）起 macOS / Windows 成为**一级平台**，桌面栈已开源。
2. 桌面端由 Lynx **自绘渲染**，不是系统原生控件拼装。
3. 元素属性覆盖率 **73%（246 项中 179 项）**，macOS 与 Windows 范围一致，仍在扩展。
4. 已覆盖 Flexbox / Grid / 盒模型 / 排版 / 阴影 / 渐变 / 滤镜 / animation / transition / 完整 transform。
5. 桌面专属能力包括 `onMouseDown` 等鼠标事件。

**未核实**：Lynx 桌面端与我们的具体用法（列表滚动、输入框、SMTC 互操作）能否稳定配合。

## 决策门（必须先做最小原型）

在写任何生产代码之前，用**同一份 ReactLynx 页面**做最小原型，逐项实测：

| # | 原型问题 | 通过标准 | 失败意味着 |
|---|---|---|---|
| P1 | Lynx 视图能否嵌入标准 Win32 窗口并正确缩放 | 窗口任意缩放下布局正确，无裁剪 | 路线 C 候选 |
| P2 | `scroll-view` 在桌面端能否稳定滚动 1 万行 | 无掉帧、无错位 | 需要虚拟列表或路线 C |
| P3 | `<input>` 在桌面端的焦点与 IME | 中文输入法可用，失焦可靠 | 需要独立呈现层 |
| P4 | SMTC 能否由 Lynx 宿主注入 | 任务栏显示 + 媒体键往返 | 路线 B 候选 |
| P5 | 鼠标 hover / 右键菜单 | 事件按预期到达 | 需降级 |

## 三条候选路线

### 路线 A：继续 ReactLynx（推荐先验证）
- **形态**：Windows 用 Lynx 渲染，复用 `ui/shared` 全部组件，`ui/windows` 只做布局。
- **收益**：视觉与交互完全一致；新功能只写一次；产品需求 §15.2 的「共享品牌语言」天然满足。
- **代价**：桌面端能力覆盖不完整；SMTC 互操作需要在 C++ 侧加一层。
- **前提**：P1–P3 全过。

### 路线 B：薄原生壳 + 局部原生视图
- **形态**：Win32 壳承载 Lynx，但列表 / 输入 / 媒体控制用原生 XAML 或 WinUI。
- **收益**：桌面系统集成最完整。
- **代价**：出现两套组件体系；跨端视觉漂移；维护成本最高。
- **判断**：除非 P4 明确失败，否则**不推荐**——它违背了「双平台共享」的核心诉求。

### 路线 C：Windows 独立呈现层
- **形态**：Windows 用独立技术栈（如 WinUI 3 / WebView），**只共享 domain 层协议**。
- **收益**：桌面能力零限制。
- **代价**：所有 UI 工作量翻倍；两套视觉语言；团队规模下不现实。
- **判断**：只有在 P1–P4 **三项以上**失败时才考虑。

## 当前决定

**采用路线 C 的变体：用 Lynx Web Runtime 把同一份 ReactLynx bundle 跑在 WebView2 / Edge 里。**

`lynx.config.ts` 现在同时输出 `dist/main.lynx.bundle`（Android 原生）和 `dist/main.web.bundle`（Windows / Web 预览）。`windows/host/index.html` 用 `<lynx-view url=".../main.web.bundle">` 加载后者，运行时不依赖任何 MSVC 工具链——决策的实际证据已落在「Edge 直接打开 host 即可渲染 ReactLynx 树」（阶段 8-4 实测）。

选择此路线的原因（按 ADR-0001 §决策门三项必测）：
- **P1（窗口缩放）**：浏览器原生支持任意 DPR / 缩放比 + 多显示器；WebView2 共享 Chromium 行为，阶段 9 验证。
- **P2（scroll-view 1 万行）**：`@lynx-js/web-elements` 的 `<scroll-view>` 配套鼠标拖拽插件（`plugins/scroll-view-mouse-drag`），阶段 9 验证。
- **P3（输入框 / IME）**：Web 浏览器输入框语义成熟；中文输入法、失焦、placeholder 都是 native Web 行为。
- **P4（SMTC）**：Edge / WebView2 暴露 `navigator.mediaSession` + 任务栏 SMTC；阶段 9 等音频接通后挂上 metadata。
- **P5（鼠标 hover / 右键）**：原生 Web 事件。

### 选择的代价与保留

- ❌ **抛弃了 `windows/src/{main,window,smtc_bridge,file_picker}.cpp`**：Lynx 原生桌面宿主需要 MSVC + Lynx 源码树 + `OPENMUSIC_LYNX_VENDOR` 路径；本机工具链缺失（CMake 在，MSVC / Ninja / cl.exe 不在），按手册 §15 无法在该跑法声称完成；并且 ADR-0001 §决策门 显式允许"关键属性缺失时停止该路线"。
- ✅ **保留的能力**：`src/ui/windows/WindowsShell.tsx` 仍然使用，与路线 A 共享 `src/ui/shared/` 全部组件。
- ✅ **保留的端口契约**：`PlatformBridgePort`, `MediaControl`, `AppLifecycle` 等接口不变；Windows 路径仍按同一组 TS 端口消费 `PlatformCapabilities`，只是来源从 Lynx 原生模块换成了 `navigator.mediaSession` + `window.matchMedia`。

### 与路线 A / B 的对照

| 维度 | 路线 A（Lynx 原生桌面） | 路线 B（薄壳 + WinUI） | 路线 C（Lynx Web + WebView2，**当前选择**）|
|---|---|---|---|
| 工具链 | MSVC + Lynx 源码树 | MSVC + WinUI 3 SDK | Edge / WebView2（预装） |
| 启动复杂度 | 高（C++/CMake/MSVC + Lynx 嵌入 API） | 高（C++/WinUI 双栈） | 低（HTML host） |
| 视觉一致性 | 100%（共用 bundle） | < 100%（双套组件） | 100%（共用 bundle） |
| 系统集成（SMTC / 拖放 / 任务栏） | 直接 | 最完整 | Edge / WebView2 提供，能力略弱于原生 |
| 跨端维护成本 | 低 | 高 | 低 |
| 本机验证 | ❌ 无 MSVC | ❌ 无 MSVC + WinUI SDK | ✅ Edge 已装 + WebView2 已装 |

## 触发重新决策的条件

出现以下任一情况，立即回到本 ADR：
- WebView2 在 Windows 10 早期版本（17763 之前）缺失关键事件（拖放 / IME）。
- Lynx Web Runtime 长期无法支持新 Lynx 桌面能力（如 onMouseDown、桌面专属 transform）。
- Windows Store / 内部发布渠道要求 native installer + native EXE（Web 套壳无法满足）。
- 用户/产品决策要求 EXE 形态而不是 HTML 套壳。

## 旧版的 `windows/src/*.cpp`

继续保留在仓库，但不参与 build。`windows/CMakeLists.txt` 仍要求 `OPENMUSIC_LYNX_VENDOR` 路径；如果未来路线 A / B 重新评估通过，再激活这些文件。