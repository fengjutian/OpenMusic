# 平台能力矩阵（Platform Capability Matrix）

> 版本：0.2.0 / 2026-10-09（阶段 0 基线审计后更新）
> 状态：**M0 阶段 0 审计完成；多数原生路径仍「未编译」**
> 依据：技术实现文档 §17；执行手册 阶段 0 基线审计（`docs/MiniMax-完整开发执行步骤与提示词.md`）
> 当前能力精确状态：见下方各表"状态"列；本月从 npm run verify / dist/ 产物 / 工具链探测得到。

## 图例

| 标记 | 含义 |
|---|---|
| ✅ 已验证 | 在本仓库内已由自动化检查或构建证明 |
| ⚠️ 代码就绪·未编译 | 原生代码已写，但**没有编译过**（本机无 Android SDK / MSVC） |
| ❌ 未实现 | 明确不做，界面不暴露入口 |
| ❓ 待实测 | 必须真机验证后才能写进产品文案 |

**为什么大量条目是「未编译」而不是「已完成」**：本仓库的开发机没有
Android SDK、Gradle、MSVC。按技术实现文档 §17「任何关键能力未验证前不得编造 API」，
我们选择把代码写出来并**显式标注未验证**，而不是把未编译的代码报成已完成。

---

## 1. 主能力矩阵

| 能力 | Android | Windows | 降级方案 | 状态 |
|---|---|---|---|---|
| 音频解码格式 | MediaStore MIME 白名单 + ExoPlayer | 需选定播放器实现 | UI 仅展示已支持格式 | ⚠️ 未编译 + ❓ 待实测 |
| 后台/系统媒体控制 | `PlaybackService`（Media3 `MediaSessionService`） | `SmtcBridge`（有意留空） | 保留应用内控制 | ⚠️ 未编译 / ❌ 未实现 |
| 目录授权与持久访问 | MediaStore + `READ_MEDIA_AUDIO` | `IFileOpenDialog` 文件夹选择器 | 单文件导入 | ⚠️ 未编译 + ❓ 待实测 |
| 文件变更监听 | 未实现 | 未实现（需 `ReadDirectoryChangesW`） | 手动/定时增量扫描 | ❌ 未实现 |
| SQLite / 事务 | `SqliteDriver`（android.database.sqlite） | 未实现 | **不允许内存数据库上线** | ⚠️ 未编译 |
| 安全存储 | `KeystoreSecretStore`（AES-GCM） | 未实现（应接 DPAPI） | 禁止明文 token | ⚠️ 未编译 |
| 托盘、拖放、快捷键 | 不适用 | 快捷键已实现；托盘/拖放未实现 | 菜单入口替代 | ⚠️ 未编译 / ❌ 未实现 |
| 安全区 inset | `WindowInsets` + `DisplayCutout` | 无（窗口坐标） | 保守 0 inset | ⚠️ 未编译 |
| 虚拟/长列表 | `scroll-view`；1 万首基准未跑 | 同左 | 分页 + 去重 | ✅ 代码已就绪 / ❓ 待实测 |
| 歌词解析 | 未实现（仅读取字段位） | 未实现 | 无歌词时显示明确空态 | ❌ 未实现 |

## 2. 已经在本仓库内**真实验证**的能力

这些结论有可复现的证据（`npm run verify`）：

| 能力 | 结论 | 证据 |
|---|---|---|
| TypeScript 严格模式编译 | ✅ 通过 | `npx tsc --build --force`，退出码 0 |
| ESLint（含 react-hooks 纯度规则） | ✅ 通过 | `npx eslint .`，0 问题 |
| 单元 + 组件测试 | ✅ 91/91 通过 | `npx rstest run`（含阶段 1 装配测试 + 阶段 9 WebAudioEngine 8 项）|
| Lynx 生产构建 | ✅ 通过 | `npx rspeedy build` → `dist/main.lynx.bundle`，293.3 kB（阶段 1 后） |
| 依赖注入与生命周期 | ✅ 阶段 1 完成 | `ServicesProvider` + `useServices()`；`createProductionServices / createDemoServices / createTestServices` 三套工厂；`Services` 接口仅暴露端口类型 |
| Android Gradle Wrapper | ✅ 阶段 2 完成 | `android/gradlew.bat` + `gradle/wrapper/gradle-wrapper.{jar,properties}`（Gradle 8.10.2 预置成功，`./gradlew.bat --version` → Gradle 8.10.2 + JDK 17） |
| Android Lynx 真实构造 | ✅ 代码完成 / ❌ 未编译 | `OpenMusicBridge.createLynxView()` 不再抛异常；使用 `LynxViewBuilder` + `AbsTemplateProvider`；依赖钉到已验证的 3.6.x；详见 `adr/0003-lynx-android-runtime-version.md` |
| Android APK 构建 | ❌ 未实现 | AGP 8.7.3 插件无本地 Maven 缓存，`--offline` 模式解析失败；`ANDROID_HOME` 未装、`adb` 缺失 |
| Android 真机启动 | ❌ 未实现 | 依赖 APK 构建产物 |
| Windows Lynx 嵌入 | ✅ 阶段 8 完成（路线 C：Lynx Web + WebView2） | Edge 直接打开 `windows/host/index.html` 渲染同一份 `main.web.bundle`（289.5 kB）；P1–P5 决策门通过；详见 `adr/0001-windows-presentation-layer.md`；`windows/src/*.cpp` 保留但不参与 build |
| Windows 音频引擎 | ✅ 阶段 9 完成（WebAudioEngine） | HTMLAudioElement 驱动；DOM 挂载 + 默认 MediaSession metadata + mediaSession action handlers；8/8 单元测试通过；`dist/main.web.bundle` 297.6 kB |
| 双线程 ReactLynx 代码 | ✅ 可构建 | 同上；`@lynx-js/react` 0.126.2 + `@lynx-js/types` 4.3.0 |
| 端口契约与依赖方向 | ✅ 通过 | domain 层不 import 任何上层模块 |
| 数据库迁移可回滚 | ✅ 纯逻辑已测 | `src/infrastructure/database/__tests__/migrator.test.ts` |
| 播放器竞态（快速切歌 / 过期回调 / seek 后切歌 / 焦点丢失） | ✅ 已测 | `src/application/__tests__/player-coordinator.test.ts` |

## 3. 逐条验证步骤（消除 ⚠️ 与 ❓）

每条都写明「怎么做」和「通过标准」，避免下次靠猜。

### 3.0 阶段 0 实测结果（2026-10-09）

| 命令 | 退出码 | 结论 |
|---|---|---|
| `npm run typecheck` | 0 | tsc 严格模式通过 |
| `npm run lint` | 0 | ESLint 0 问题 |
| `npm test` | 0 | 76/76 通过 |
| `npm run build` | 0 | `dist/main.lynx.bundle` 291.3 kB |
| `npm run build:android` | **1** | `rspeedy` 不识别 `--platform` 参数（rspeedy 0.18.0） |
| `npm run build:windows` | **1** | 同上 |
| `node scripts/check-imports.mjs` | 0 | broken specifiers: 0 |
| `npx rspeedy build` (env `OPENMUSIC_PLATFORM=android`) | 0 | 同 bundle 文件名，291.3 kB |
| `npx rspeedy build` (env `OPENMUSIC_PLATFORM=windows`) | 0 | 同 bundle 文件名，292.1 kB |

**bundle 真相**：`OPENMUSIC_PLATFORM` 仅作为 `__OPENMUSIC_PLATFORM__` 字符串 define 注入 bundle，
**Android 与 Windows 共用同一 `dist/main.lynx.bundle`**，体积差异来自 define 字符串差。
`lynx.config.ts` 注释暗示"通过 `--platform` 切换独立 bundle"是错的。

**构建期警告**（每次构建必出）：
```
(node:xxxxx) MaxListenersExceededWarning: Possible EventEmitter memory leak detected.
13 error listeners added to [Socket]. MaxListeners is 10.
```
`node --trace-warnings` 锁源：
```
Socket.once (...) at @lynx-js/rspeedy/dist/src_cli_main_ts~1.js:144:20
at flush (src_cli_main_ts~1.js:138:29)
at flushStdio (src_cli_main_ts~1.js:160:13)
```
**根因 = rspeedy 0.18.0 CLI 的 `flushStdio()` 在 stdout Socket 上每行输出注册一次 `once('error',...)`**。13 次 flush × 一次 listener = 13 > 默认 10。**与 OpenMusic 代码无关**。
验证：阶段 1 装配测试 `services.test.tsx → keeps engine listener set size stable across mount/unmount cycles` 通过（5 次 mount/unmount，监听器集合大小恒定）。
**处理**：不调高 `MaxListeners` 上限（手册 §1.8 禁止）；不在 npm script 里加 `--no-warnings`（手册禁止"通过隐藏错误让构建变绿"）；rspeedy 版本已锁定 0.18.0（AGENTS.md），升级需要单独 ADR。**追踪为 rspeedy 上游 bug**，下一轮工具链升级时复测。

**工具链状态**：

| 工具 | 状态 |
|---|---|
| Node | v24.14.1 |
| npm | 11.11.0 |
| Java (JDK) | OpenJDK 17.0.20.1 LTS |
| Gradle (system) | **未安装**（任务 #4 需补齐 Wrapper） |
| Gradle Wrapper | **缺失**（`android/gradlew.bat`、`gradle/wrapper/` 均不存在） |
| CMake | 4.3.3 |
| MSVC `cl.exe` | **未安装**（Windows 链路阻断） |
| Ninja | **未安装** |
| Android SDK / `adb` / `ANDROID_HOME` | **未安装 / 未设置** |
| VS 2022 Desktop C++ | **未安装** |

**Mock / Fake / Memory 命中清单**（src 内，非测试）：

| 文件 | 类型 | 用途 |
|---|---|---|
| `src/infrastructure/repository/mock-music-repository.ts` | Mock | `MockMusicRepository`，默认 catalog |
| `src/infrastructure/audio/fake-audio-engine.ts` | Fake | `FakeAudioEngine`，默认 `PlayerCoordinator` 音频后端 |
| `src/infrastructure/settings/memory-settings.ts` | Memory | `MemorySettings` + `MemorySecureStorage`，默认 settings |
| `src/app/services.ts` | 装配 | **生产装配直接 `new` 上述三类**；`usingMocks` 仅作为埋点字段，不强制失败 |

**Android 未实现/阻断点**（阶段 2 状态）：

- ~~`OpenMusicBridge.createLynxView()` 抛 `UnsupportedOperationException`~~ → **阶段 2 已修**：使用 3.6.x 真实 API + `AbsTemplateProvider`。
- ~~Gradle Wrapper 缺失~~ → **阶段 2 已补**：`gradlew.bat --version` 跑通。
- `org.lynxsdk.lynx:lynx:4.1.0` 不存在公开包 → **阶段 2 改为 3.6.0 + 详细 ADR**。
- ❌ **AGP 8.7.3 插件无法解析**：本机无 `~/.gradle/caches/modules-2/files-2.1/com.android.application/...`，且 `--offline` 模式下无法从 dl.google.com 下载。
- ❌ **`ANDROID_HOME` 未设 / `adb` 缺失**：无法执行 `gradlew :app:assembleDebug` 后续阶段。
- ❌ **真机/模拟器验证缺失**：安装 APK、logcat 抓取、连续启动 10 次无崩溃 — 全部无法在本机跑。

**安装项（按手册 §二阶段 2 验收要求）**：

| 项 | 命令 | 验证命令 |
|---|---|---|
| Android SDK Platform 35 | Android Studio SDK Manager 或 `sdkmanager "platforms;android-35"` | `sdkmanager --list_installed` |
| Build-Tools 35.x | `sdkmanager "build-tools;35.0.0"` | 同上 |
| Platform-Tools (adb) | `sdkmanager "platform-tools"` | `adb version` |
| Maven cache for AGP 8.7.3 | 首次 `gradlew.bat :app:assembleDebug`（需访问 dl.google.com） | `./gradlew --version` 不报 plugin 未找到 |
| 真机或模拟器 API 26+ | Android Studio AVD 或物理设备 | `adb devices` 看到设备 |

**Windows 未实现/阻断点**：

- `SmtcBridge::{Initialize,Shutdown,SetPlaying,SetPosition,UpdateMetadata}` 全部空函数体。
- MSVC / cl.exe / Ninja 未安装；CMakeLists 在，但无法本地 `cmake --build`。
- Lynx Windows 运行时未引入；包内体积/ABI 未评估。
- ADR-0001 已有路线选择，但缺最小可运行原型（任务 §3.6）。

**生产入口 → 关键端口 依赖图（事实版）**：

```
App.tsx (createServices())
       └── services.ts (createServices)
             ├── PlatformBridge ← platform/bridge.ts (按 globalThis 探测 native)
             ├── Settings ← MemorySettings (内存实现)
             ├── Catalog  ← MockMusicRepository (内存实现 + seed)
             ├── AudioEngine ← FakeAudioEngine (虚拟时钟)
             │       ↑ PlayerCoordinator 唯一调用方 ✅
             └── Analytics ← PrivacyFilteringAnalytics(ConsoleAnalytics)

App.tsx (useEffect) → services.bridge.safeAreaInsets() / windowSize()
AppShell → getServices()  ←─── services.ts 模块 singleton (缓存)
```

**当前问题**（阶段 1 直接对应）：
1. `App.tsx` 每次渲染都 `createServices()` → 每次都 `new FakeAudioEngine` + `new MockMusicRepository` + `player.start()`。
2. `AppShell` 走 `getServices()` 的 cached singleton → **存在两个 Services 实例**（一份随渲染新建，一份缓存）和 **两个媒体事件订阅源**。
3. `player.start()` 在 `createServices()` 内立即执行；旧实例的 `dispose()` 只在 `resetServices()` 才触发。
4. 上述两个源头合起来就是 §3.0 提到的 `MaxListenersExceededWarning` 的可能放大器（实际根因待 rspeedy/rstest 进程内查证）。

### 3.1 Android — 首次可编译构建
```powershell
npm run build:android
cd android; $env:ANDROID_HOME="<SDK>"; .\gradlew.bat :app:assembleDebug
```
**通过标准**：产出 APK，`adb logcat` 无 `UnsatisfiedLinkError`。

### 3.2 Android — 运行时版本对齐（**阻塞项**）
`org.lynxsdk.lynx:lynx` 的引擎版本必须与 `@lynx-js/react` 0.126.2 对应的引擎一致。
**通过标准**：JS 侧 `root.render` 成功，`view`/`text`/`scroll-view` 均按预期渲染。
版本不匹配的表现是属性静默失效，比崩溃更难查，必须先做这一条。

### 3.3 Android — 安全区
在刘海屏 + 纯手势导航的真机上，对比 `OpenMusicBridge.currentInsets()` 与截图。
**通过标准**：底部导航栏不被小白条遮挡；`paddingBottom` 等于实测 bottom inset。

### 3.4 Android — 音频格式（**决定产品文案**）
用同一批样本在最低支持版本与当前主流版本上解码。
**通过标准**：每种格式两台设备都能播放，失败有明确错误码。
在此之前，`MediaStoreScanner.isSupported()` 的白名单只是**假设**，界面不得宣称支持。

### 3.5 Android — 后台播放
息屏、切到其他应用、系统回收进程三种情况。
**通过标准**：三种情况下音乐不中断；进程被杀后能恢复当前曲目与进度。

### 3.6 Windows — Lynx 嵌入
按 [ADR-0001](adr/0001-windows-presentation-layer.md) 的决策门执行最小原型。
**通过标准**：一个 Lynx 页面能在 Win32 窗口内渲染并响应鼠标。

### 3.7 Windows — 系统媒体控制
`SmtcBridge` 目前是空实现。
**通过标准**：任务栏显示当前曲目，OS 媒体键可控制播放。

### 3.8 双平台 — 1 万首性能基准
生成 1 万首假曲库（临时目录，不碰用户真实音乐目录）。
**通过标准**：搜索 P95 ≤ 200ms；切歌 UI 反馈 ≤ 150ms；启动不卡死。

## 4. 已知风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| Windows Lynx 桌面属性覆盖 73% 且仍在变动 | UI 可能需要 Windows 专属降级 | 共享组件只接收行为，布局由平台壳决定（§23） |
| 原生代码完全未编译 | 首轮真机构建可能大面积返工 | 每条能力都有独立验证步骤，可增量推进 |
| 输入框非受控（Lynx `<input>` 只有 `default-value`） | 搜索框清空/回填行为与 Web 不同 | `SearchField` 用 `key` 重挂载实现清空，已在代码注释中记录 |
| 无布局测量 API | 进度条拖动需要调用方传宽度 | `ProgressBar` 强制 `trackWidth` prop，见 [ADR-0002](adr/0002-progress-bar-scrubbing.md) |
| SMTC 互操作是 Windows 侧最大工程风险 | 可能需要独立呈现层 | 已留空并在 UI 中隐藏，见 ADR-0001 |