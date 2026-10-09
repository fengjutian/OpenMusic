# 平台能力矩阵（Platform Capability Matrix）

> 版本：0.1.0 / 2026-10-09
> 状态：**M0 第一版，多数行为「未实测」**
> 依据：技术实现文档 §17「实施前必须输出 `docs/platform-capability-matrix.md`，实机验证以下项目」

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
| 单元 + 组件测试 | ✅ 76/76 通过 | `npx rstest run` |
| Lynx 生产构建 | ✅ 通过 | `npx rspeedy build` → `dist/main.lynx.bundle`，281.5 kB |
| 双线程 ReactLynx 代码 | ✅ 可构建 | 同上；`@lynx-js/react` 0.126.2 + `@lynx-js/types` 4.3.0 |
| 端口契约与依赖方向 | ✅ 通过 | domain 层不 import 任何上层模块 |
| 数据库迁移可回滚 | ✅ 纯逻辑已测 | `src/infrastructure/database/__tests__/migrator.test.ts` |
| 播放器竞态（快速切歌 / 过期回调 / seek 后切歌 / 焦点丢失） | ✅ 已测 | `src/application/__tests__/player-coordinator.test.ts` |

## 3. 逐条验证步骤（消除 ⚠️ 与 ❓）

每条都写明「怎么做」和「通过标准」，避免下次靠猜。

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