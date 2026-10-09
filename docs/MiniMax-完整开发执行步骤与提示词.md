# OpenMusic 完整开发执行步骤与 MiniMax 提示词

> 版本：V1.0  
> 日期：2026-10-09  
> 使用对象：MiniMax 开发代理  
> 需求基线：`OpenMusic-UI-产品需求文档.md`、`OpenMusic-UI-技术实现文档-MiniMax.md`  
> 当前结论：仓库是可构建的 ReactLynx/TypeScript 原型，不是已经完成的双平台本地播放器

---

## 一、如何使用这份文档

将“第二部分：总控提示词”完整发送给 MiniMax。MiniMax 完成一个阶段并提供证据后，再把对应阶段的提示词发送给它。不要一次要求它跨越所有阶段直接宣称完成。

每个阶段必须满足三个条件才能进入下一阶段：

1. 代码已提交到仓库，不是只给方案或代码片段。
2. 本阶段要求的构建、测试和实机验证均有可复现证据。
3. 未完成项被明确标注，不得用 Mock、Stub、静态页面或“代码已就绪”替代真实能力。

优先级顺序：

```text
P0-1 修复应用装配
  → P0-2 Android 宿主能启动
  → P0-3 真实音频播放
  → P0-4 本地扫描与 SQLite 入库
  → P0-5 音乐库/搜索/歌单真实化
  → P0-6 Android 后台播放与恢复
  → P0-7 Android MVP 验收
  → P1 Windows 技术原型与路线确认
  → P1 Windows 本地播放器
  → P2 同步、Provider、商业能力
```

---

## 二、发给 MiniMax 的总控提示词

```text
你现在负责继续开发 D:\github\OpenMusic。不要把当前仓库描述为“已经完成”。

必须先完整阅读：
1. AGENTS.md
2. README.md
3. docs/OpenMusic-UI-产品需求文档.md
4. docs/OpenMusic-UI-技术实现文档-MiniMax.md
5. docs/platform-capability-matrix.md
6. docs/adr/ 下全部 ADR
7. docs/MiniMax-完整开发执行步骤与提示词.md

当前已知事实：
- npm run verify 可以通过，但只验证 TypeScript、lint、单元测试和 Lynx bundle。
- src/app/services.ts 正式装配仍默认使用 MockMusicRepository、FakeAudioEngine、MemorySettings。
- src/app/App.tsx 直接 createServices()，页面却使用 getServices()，存在两套依赖图、重复 PlayerCoordinator 和订阅泄漏风险。
- Android OpenMusicBridge.createLynxView() 直接抛 UnsupportedOperationException。
- Android AudioEnginePort 未实现，原生代码从未完成 Gradle 编译与真机验证。
- Windows 宿主从未完成 CMake 构建；Lynx 嵌入未接通；SMTC、拖放、托盘、数据库和音频引擎未完成。
- PlatformCapabilities.fileImport 和 systemNowPlaying 当前为 false。

总目标：
先交付一个真正可安装、可离线使用的 Android 本地音乐播放器 MVP，再推进 Windows。
Android MVP 必须做到：授权/选择音乐 → 扫描 → SQLite 入库 → 浏览/搜索 → 真实播放 →
队列/歌词/收藏/歌单 → 后台与通知控制 → 重启恢复。整个流程不能依赖 Mock。

强制规则：
1. 先审计，后修改。不要删除或覆盖用户已有改动。
2. 依赖只能向内；Domain 不依赖 application/infrastructure/ui/platform。
3. 页面不得直接调用原生模块、SQL 或文件系统。
4. PlayerCoordinator 是播放器唯一编排者；UI 不维护第二份播放状态。
5. 原音频文件默认只读，不写标签、不移动、不删除。
6. 不引入 Ant Design、MUI、Chakra、Tailwind UI 或浏览器专用 API。
7. 不猜测 Lynx、Android、Windows API。先核对当前锁定版本的官方接口并编译验证。
8. 生产装配禁止使用 MockMusicRepository、FakeAudioEngine、MemorySettings、MemoryDriver。
9. Mock/Fake 仅允许在测试、Story/演示入口或显式 development flag 下使用；正式构建检测到 Mock 必须失败。
10. 任何“完成”必须附 APK/EXE、命令退出码、测试结果和实机操作证据。
11. 不允许通过隐藏错误、跳过测试、删除断言或降低 TypeScript/ESLint 严格度让构建变绿。
12. 修改后运行最小相关测试；阶段结束运行完整 verify 和平台构建。

工作方式：
- 严格按照本执行手册的阶段 0 到阶段 10 依次推进。
- 每次只实施一个阶段，阶段完成后停止并汇报，等待确认后再进入下一阶段。
- 遇到架构选择或平台 API 不可用，先写 ADR，列出证据、选项、影响和建议，不要擅自换栈。
- 如果环境缺 Android SDK、MSVC、Lynx runtime 或设备，不得声称完成；先列出精确安装项和验证命令。

每个阶段结束必须按以下模板报告：

## 阶段 N 交付报告
- 本阶段目标：
- 完成的需求：
- 未完成的需求：
- 修改文件及每个文件的作用：
- 新增/变更的数据结构和 migration：
- 运行的命令、退出码和摘要：
- 自动化测试结果：
- 实机/模拟器验证步骤与结果：
- 产物绝对路径及 SHA-256：
- 性能数据：
- 已知限制与风险：
- 回滚方式：
- 下一阶段建议：

现在只执行阶段 0：仓库基线审计。不要开始大规模编码。
```

---

## 三、阶段 0：仓库基线审计与环境准备

### 目标

建立可信基线，确认现有代码、工具链、Android/Windows 构建环境和真实缺口。该阶段只允许修复阻止基线运行的微小配置问题，不做功能开发。

### 任务

1. 记录 `git status --short`、当前分支、HEAD、Node/npm/Java/Gradle/CMake/MSVC/Android SDK 版本。
2. 阅读全部约束文档和 package scripts。
3. 运行：

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run build:android
npm run build:windows
node scripts/check-imports.mjs
```

4. 检查 Android 工程是否包含 Gradle Wrapper；若没有，补齐经过验证的 Wrapper，不依赖机器全局 Gradle。
5. 运行 Android 原生构建：

```powershell
cd android
./gradlew.bat :app:assembleDebug --stacktrace
```

6. 检查 Windows 是否安装 VS 2022 Desktop C++、CMake、Windows SDK；尝试配置和构建。
7. 搜索所有 `TODO`、`FIXME`、`UnsupportedOperationException`、Mock/Fake/Memory 实现和空方法。
8. 画出正式入口到 Repository、Database、Scanner、AudioEngine、Settings、PlatformBridge 的真实依赖图。
9. 更新 `docs/platform-capability-matrix.md`，每项只能标记：已编译、已自动测试、已模拟器验证、已真机验证、未实现。
10. 对 Windows Lynx 嵌入路线给出 ADR 更新建议，但本阶段不大规模实现。

### 验收

- 能明确指出 Android 构建的第一个真实阻断点。
- 能明确指出 Windows 构建的第一个真实阻断点。
- 输出所有生产路径中 Mock/Stub 的清单。
- 不得以 `npm run build` 成功替代 APK/EXE 构建。

### 阶段提示词

```text
执行《MiniMax-完整开发执行步骤与提示词.md》的阶段 0。
只做基线审计、环境探测、完整构建尝试和能力矩阵更新。
不要把 Lynx bundle 构建当作 Android/Windows 产品构建。
不要开始页面重写。按规定模板提交证据后停止。
```

---

## 四、阶段 1：修复依赖注入与应用生命周期

### 目标

应用全生命周期只存在一套 Services 和一个 PlayerCoordinator，为真实实现替换 Fake 奠定基础。

### 当前问题

- `App.tsx` 每次渲染调用 `createServices()`。
- 页面和 hooks 使用 `getServices()` 的另一套 singleton。
- `PlayerCoordinator.start()` 在创建时自动执行，旧实例没有可靠释放。

### 实施要求

1. 建立 `ServicesProvider`/`useServices()`，或在应用启动模块只创建一次 services 后注入 React 树。
2. 删除页面对隐式 `getServices()` 的依赖；逐步迁移为 Context/显式依赖。
3. 确保严格模式、重渲染、热更新不会创建第二个播放器或重复订阅。
4. 明确 `start()` 和 `dispose()` 生命周期；根组件卸载必须释放。
5. 将生产装配和测试装配分开：

```text
createProductionServices(platformAdapters)
createTestServices(overrides)
createDemoServices()  // 仅显式开发模式
```

6. `Services` 使用端口类型，不暴露 `MemorySettings` 等具体类。
7. 增加装配测试：连续渲染、重渲染、卸载后，只调用一次 start/dispose，事件监听数不增长。
8. 处理构建中的 `MaxListenersExceededWarning`，先定位根因，不得简单提高监听上限掩盖问题。

### 验收

- 应用和所有页面获得同一个 `PlayerCoordinator` 对象。
- 重渲染不会产生新的 Services。
- 测试能证明订阅被清理。
- `npm run verify` 无新增警告；若监听警告仍存在，必须有根因和修复任务。

### 阶段提示词

```text
执行阶段 1：修复依赖注入与应用生命周期。
重点修复 App.tsx 的 createServices 与页面 getServices 双实例问题。
建立唯一生产 composition root、ServicesProvider/useServices、明确 start/dispose。
为单实例、重渲染和清理增加测试。不要开始真实音频或扫描实现。
完成后运行 npm run verify，并按模板汇报后停止。
```

---

## 五、阶段 2：Android 宿主真正启动 ReactLynx

### 目标

产出可以安装和启动的 Debug APK，ReactLynx 页面由 Android 宿主真实渲染，而不是抛异常。

### 实施要求

1. 核对 `@lynx-js/react`、Rspeedy 插件和 Android Lynx runtime 的兼容版本；把结论记录到 ADR。
2. 完成 Gradle 配置、仓库、依赖、ABI、minSdk/targetSdk、Java/Kotlin 版本对齐。
3. 将 `dist/main.lynx.bundle` 可靠复制进 Android assets，构建任务声明输入输出和依赖关系。
4. 实现 `OpenMusicBridge.createLynxView()`：
   - 初始化 Lynx runtime/context；
   - 加载 bundle；
   - 创建并挂载 LynxView；
   - 处理销毁；
   - 将必要桥接能力用当前版本真实支持的方式暴露。
5. 完成 Activity 生命周期、WindowInsets、安全区、错误页面和启动日志。
6. 开发构建可显示诊断信息；Release 构建不泄漏路径、token 或调试接口。
7. 在至少一个模拟器和一台真实 Android 设备安装并启动。
8. 保存构建命令、APK 路径、SHA-256、设备型号/API、启动截图和关键 logcat。

### 必测场景

- 冷启动、返回桌面再进入、旋转策略、深色模式、安全区。
- bundle 缺失或损坏时显示可诊断错误，不是黑屏。
- 连续启动 10 次无崩溃。

### 验收

```powershell
./gradlew.bat clean :app:assembleDebug
adb install -r <apk>
adb shell am force-stop com.openmusic.app
adb shell monkey -p com.openmusic.app 1
```

APK 能打开实际 UI，`createLynxView()` 不再抛异常。

### 阶段提示词

```text
执行阶段 2：让 Android 宿主真正启动 ReactLynx。
必须使用锁定版本的真实 Lynx Android API，不得猜测接口。
完成 Gradle 构建、bundle assets 集成、LynxView 生命周期和 bridge 初始化。
交付可安装 APK、SHA-256、模拟器及真机启动证据。不要开始扫描和播放器业务。
```

---

## 六、阶段 3：Android 真实音频引擎与 PlayerCoordinator 接通

### 目标

使用本地测试音频完成真实播放，生产构建不再注入 `FakeAudioEngine`。

### 实施要求

1. 选择并锁定 Android 音频实现（优先项目已采用的 Media3/ExoPlayer），写 ADR。
2. 实现 `NativeAudioEngine` 与桥协议：load、play、pause、seek、volume、dispose、事件订阅。
3. 定义跨桥事件：ready、playing、paused、buffering、position、duration、ended、error。
4. 每次 load 带 generation/request ID，旧回调不能覆盖新曲目。
5. 将原生错误映射到稳定的 `AppError`，保留可诊断错误码但不向用户暴露堆栈。
6. 生产装配在 Android 上必须选择 NativeAudioEngine；缺失时明确失败，不得静默回退 Fake。
7. UI 播放、暂停、seek、上一首、下一首、重试均通过 PlayerCoordinator。
8. 使用仓库内小型、许可清晰的测试音频或开发机临时样本验证；不要提交版权音乐。
9. 增加桥契约测试、竞态测试和 Android 集成测试。

### 必测场景

- 播放、暂停、seek、结束自动下一首。
- 快速连续点击三首歌曲，最终只播放最后选择的歌曲。
- 加载失败可重试；不可播放文件不会卡死队列。
- 页面切换时音频不中断，UI 状态一致。
- Activity 重建后不会创建第二个原生播放器。

### 验收

- 真实听到本地测试音频。
- FakeAudioEngine 只出现在测试/显式 demo 装配。
- MiniPlayer、NowPlaying、Queue 的曲目和状态始终一致。

### 阶段提示词

```text
执行阶段 3：实现 Android NativeAudioEngine 并接入唯一 PlayerCoordinator。
生产构建禁止回退 FakeAudioEngine。处理 generation ID、事件协议、错误映射和生命周期。
用真实本地音频完成播放/暂停/seek/切歌/结束自动下一首实机验证。
交付测试和日志证据后停止。
```

---

## 七、阶段 4：SQLite、扫描、元数据和本地 Repository

### 目标

打通“授权或选目录—扫描—读取元数据—SQLite 入库—音乐库显示”的真实链路。

### 4.1 数据库

1. 使用 Android SQLite 驱动接通现有 migrator；生产禁用 MemoryDriver。
2. 核对 V2 技术文档中的表：tracks、artists、albums、track_artists、playlists、playlist_items、favorites、play_history、lyrics、scan_roots、scan_runs、settings、sync_changes。
3. 对当前 MVP 不使用的云同步表可以建表但不启用业务。
4. 所有 migration 可重复验证，升级失败回滚并保留备份。
5. 配置外键、唯一索引、分页查询索引和搜索索引。
6. 数据库操作不得运行在 UI 主线程。

### 4.2 文件授权与扫描

1. 按 Android API 版本正确处理 MediaStore、READ_MEDIA_AUDIO/旧版权限或 SAF。
2. 权限仅在用户点击扫描/选择目录时请求。
3. 记录持久目录授权；撤权后标记 root 状态，不崩溃。
4. 扫描器支持进度、取消、恢复、批量事务和错误报告。
5. 使用平台媒体 ID；缺少稳定 ID 时组合规范引用、大小、修改时间和轻量指纹。
6. 首次不对所有大文件计算完整哈希。
7. 不扫描未授权目录，不写、移动或删除原文件。

### 4.3 元数据

读取标题、歌手、专辑、专辑艺术家、时长、年份、流派、曲目号、碟号、封面和歌词字段。损坏标签需降级为文件名/未知歌手/未知专辑。

### 4.4 Repository

实现 `LocalMusicRepository`，所有页面通过端口消费；API DTO/数据库行必须经过 mapper。MockRepository 不得进入 production composition root。

### 必测场景

- 首次扫描、重复扫描、增量新增。
- 文件重命名/移动、删除、重新出现。
- 重复文件、0 字节文件、损坏标签、无封面、超长标题。
- 扫描中取消、进程被杀、权限撤回。
- 100、1,000、10,000 首数据集。

### 验收

- 重启应用后曲库仍存在。
- 相同目录重复扫描不生成重复曲目。
- 本地曲目可以由真实 Repository 交给播放器播放。
- 扫描报告显示新增/更新/跳过/失败数量。

### 阶段提示词

```text
执行阶段 4：完成 Android SQLite、本地扫描、元数据读取和 LocalMusicRepository。
生产装配禁止 MemoryDriver 和 MockMusicRepository。原音频只读。
实现权限按需申请、增量幂等扫描、批量事务、取消、失败报告和数据库持久化。
使用临时测试目录覆盖重复、移动、删除、坏文件和 1 万首基准。
交付 migration、测试、实机扫描证据后停止。
```

---

## 八、阶段 5：将全部 UI 从演示数据切换到本地数据

### 目标

Home、Search、Library、详情、播放器、队列和设置全部消费真实本地 Repository，不存在静态假入口。

### 任务

1. 音乐库实现歌曲、专辑、歌手、文件夹、歌单视图。
2. 本地搜索覆盖歌曲、歌手、专辑、歌单；输入防抖、请求序号和过期响应处理。
3. 首页在本地优先模式展示最近播放、最近添加、常听歌曲和用户歌单；无数据时引导扫描。
4. 专辑、歌手、歌单详情由数据库查询，支持分页。
5. 收藏和歌单写入 SQLite，乐观更新失败时回滚。
6. 支持新建、重命名、删除歌单；删除需确认，曲目移除可撤销。
7. 队列可从歌曲列表/专辑/歌单构建，支持下一首播放、追加、移除和清空追加项。
8. 读取内嵌歌词和本地同名歌词；解析 LRC，支持纯文本降级。
9. 各页完整实现 loading/success/empty/error，断网时不影响本地功能。
10. 若能力未实现，隐藏入口或显示明确禁用原因，不允许点后无响应。

### UI 验收

- 360、390、430dp 下无关键遮挡。
- 长中文、英文、Emoji、RTL 文件名不会破坏布局。
- 主要触控目标不小于 44×44。
- 页面切换保留播放和合理的滚动状态。
- 不出现网易云或 Spotify 商标和复制素材。

### 阶段提示词

```text
执行阶段 5：把全部 UI 从演示数据切换为 LocalMusicRepository 和 SQLite。
完成音乐库、搜索、详情、收藏、歌单、队列、最近播放和本地歌词闭环。
删除生产 UI 对 seed-data/MockRepository 的依赖，补齐所有异步状态和分页。
提供不同屏宽截图、交互测试和真实曲库操作证据后停止。
```

---

## 九、阶段 6：Android 后台播放、系统控制和恢复

### 目标

页面退出或 Activity 重建后播放继续，通知、耳机和系统媒体按键可控制同一个播放会话。

### 任务

1. 将播放器所有权放到 MediaSessionService/项目验证后的等效服务，而不是 Activity/Lynx 页面。
2. 实现前台服务通知渠道、媒体通知、封面、标题、歌手和控制按钮。
3. 处理音频焦点：暂时丢失、永久丢失、duck、恢复。
4. 处理耳机拔出和蓝牙断开，默认暂停。
5. 系统媒体按钮、通知按钮和 UI intent 汇聚到 PlayerCoordinator/同一命令协议。
6. 持久化当前曲目、队列、index、position、模式和 context。
7. 冷启动恢复元数据和队列，不自动出声；用户按播放后从合理位置继续。
8. 服务被系统回收后按平台许可恢复；不制造多个 MediaSession。
9. 通知权限和前台服务权限按 Android 版本处理。

### 真机矩阵

- 项目最低 API 设备/模拟器。
- 当前主流 Android 版本真机。
- 息屏、锁屏、切换应用、来电/音频焦点、拔耳机。
- 杀 Activity、杀进程、系统回收、重启设备后的合理恢复。

### 验收

- Activity 销毁不终止正在播放的音乐。
- 通知栏和 UI 状态双向同步。
- 不出现双重播放、重复通知或两套队列。
- 崩溃/强退后的数据库和队列无损坏。

### 阶段提示词

```text
执行阶段 6：实现 Android MediaSession/前台服务、通知控制、音频焦点、耳机事件和播放恢复。
播放会话必须独立于 UI 页面且只有一个事实来源。
按最低 API 与当前主流版本进行真机验证，交付通知截图、logcat 和恢复测试证据后停止。
```

---

## 十、阶段 7：Android MVP 产品化验收

### 目标

形成可交给真实用户试用的 Android APK，而不是开发演示包。

### 任务

1. 清理生产路径中的 Mock/Fake/Memory 和 seed-data。
2. 为 debug/demo/prod 建立明确构建变体；prod 禁止调试服务和测试数据。
3. 检查权限说明、隐私设置、日志脱敏和清理数据功能。
4. 完成导出/导入歌单、收藏、编辑元数据和设置的最小可恢复版本。
5. 完成数据库备份与 migration 恢复测试。
6. 运行 1 万首性能基准和 5 万首压力测试。
7. 检查封面缓存上限、失效策略和磁盘空间不足处理。
8. 完成崩溃、ANR、内存和电量基础检查。
9. 制作 Release APK；如果准备上架，再配置签名、AAB、ProGuard/R8 和商店材料。

### 发布门禁

以下任何一项失败都不能称为 Android MVP 完成：

- 无法从真实目录导入并播放。
- 重启后曲库/歌单/收藏丢失。
- 后台播放或通知控制不可用。
- APK 未能在干净设备安装。
- 正式装配仍引用 Mock/Fake/Memory。
- 没有 migration/备份恢复测试。
- 1 万首曲库无法正常搜索或滚动。

### 阶段提示词

```text
执行阶段 7：Android MVP 产品化和发布门禁。
建立 prod 构建变体，禁止任何 Mock/Fake/Memory 进入正式装配。
完成隐私、导入导出、备份恢复、1 万/5 万首性能、干净设备安装和 Release 构建。
逐条提交发布门禁证据；任何一项失败必须报告未完成，不得宣称 MVP 完成。
```

---

## 十一、阶段 8：Windows 技术原型与架构决策

### 目标

先证明 Windows 路线可行，再建设完整客户端。不得在 Lynx 嵌入未跑通前堆叠更多未经编译的 C++。

### 任务

1. 安装并记录 VS 2022 Desktop C++、Windows SDK、CMake 和目标 Lynx Windows runtime。
2. 阅读并更新 ADR-0001，比较：
   - ReactLynx Windows 原生宿主；
   - 薄原生壳 + Lynx；
   - 独立 Windows 呈现层、共享 Domain/Application 协议。
3. 完成最小原型：窗口内真实渲染一个 Lynx 页面，鼠标/键盘事件可用，可加载生产 bundle。
4. 验证 100%、125%、150%、200% 缩放和多显示器。
5. 验证窗口最小尺寸、关闭行为、异常处理。
6. 用数据选择最终路线并锁定，不以“理论支持”作结论。

### 决策门

若 Lynx Windows 宿主无法稳定构建或关键属性缺失，立即停止该路线，提交证据化 ADR，由用户决定是否采用独立 Windows UI 技术。业务模型、数据库 schema 和端口协议继续复用。

### 阶段提示词

```text
执行阶段 8：Windows 最小技术原型与 ADR 决策。
先完成可编译、可运行、可交互的 Lynx Windows 嵌入原型，再决定路线。
不要继续编写未经编译的系统集成 Stub。交付 EXE、SHA-256、构建日志、缩放截图和 ADR 后停止。
若路线不可行，要明确建议替代呈现层并等待确认。
```

---

## 十二、阶段 9：Windows 本地播放器 MVP

### 前提

阶段 8 的 Windows 路线已由用户确认。

### 任务

1. 实现 Windows AudioEnginePort，验证常用格式与错误行为。
2. 实现 SQLite 驱动和与 Android 相同版本的 migration。
3. 实现文件/文件夹选择、持久扫描根、增量扫描、路径规范化和可移动盘状态。
4. 实现三栏布局、响应式收缩、右键菜单、悬停和键盘快捷键。
5. 实现拖放导入；不支持时从 capability 隐藏。
6. 实现 SMTC：元数据、封面、播放状态、进度和系统按键。
7. 实现托盘与关闭策略，首次解释退出/最小化行为。
8. 实现 DPAPI/Credential Manager 安全存储适配器。
9. 复用 PlayerCoordinator、Repository 契约和数据库 schema，不复制业务逻辑。
10. 验证本地优先、断网、1 万首曲库和应用重启恢复。

### 验收

- 产出可运行 EXE/安装包。
- 从文件夹导入、检索和真实播放完整可用。
- SMTC、快捷键、窗口缩放和托盘按产品文档运行。
- Windows 正式装配不使用 Mock/Fake/Memory。

### 阶段提示词

```text
在阶段 8 路线已确认的前提下执行阶段 9：Windows 本地播放器 MVP。
完成真实音频、SQLite、目录扫描、桌面交互、SMTC、托盘、安全存储和恢复。
业务规则必须复用共享 Domain/Application，平台差异只在 adapter 和 Windows UI 壳。
交付 EXE/安装包及完整验收证据后停止。
```

---

## 十三、阶段 10：双平台一致性、同步与未来商业能力

### 目标

在两个本地 MVP 都稳定后，才开始账号、同步、Provider 和商业能力。

### 任务顺序

1. 数据导出格式和 schema version 双平台一致。
2. 同一曲库样本在两端扫描结果和字段语义一致。
3. 建立可选账号与安全 token 存储。
4. 实现 outbox、checkpoint、幂等上传、tombstone 和冲突收敛测试。
5. 默认不同步音频文件；先同步歌单、收藏、编辑元数据、进度和设置。
6. Provider 使用命名空间 ID、能力声明、超时、熔断、撤权和来源标识。
7. 未完成授权、隐私和品牌合规前不得连接商业音乐平台。
8. Pro 权益不能锁住本地播放、基础整理或用户数据导出。
9. 支付、订阅和删除账号另做安全及商店审核。

### 阶段提示词

```text
仅在 Android 和 Windows 本地 MVP 均通过验收后执行阶段 10。
先完成双平台数据兼容，再实现可选账号与同步；最后才接 Provider 和商业能力。
本地功能不能依赖服务器。同步需有 outbox、幂等、tombstone、冲突收敛和撤权测试。
任何第三方音乐服务必须先完成授权、隐私和品牌合规审查。
```

---

## 十四、MiniMax 每轮必须执行的检查清单

### 修改前

- [ ] 已读取 AGENTS.md 和相关需求章节。
- [ ] 已检查工作区状态并保留用户改动。
- [ ] 已说明本轮范围和不做的事项。
- [ ] 已确认相关 API 来自当前锁定版本而非记忆猜测。

### 修改中

- [ ] Domain 没有依赖外层。
- [ ] UI 没有直接调用 Native/SQL/FileSystem。
- [ ] 没有新建第二份播放状态。
- [ ] 没有在生产路径加入 Mock/Fake/Memory。
- [ ] 没有写死品牌色、平台路径、设备尺寸或用户目录。
- [ ] 原音频保持只读。
- [ ] 异步任务支持错误、取消和过期响应处理。

### 修改后

- [ ] 运行相关单元/组件/集成测试。
- [ ] 运行 `npm run verify`。
- [ ] 运行 Android 或 Windows 原生构建。
- [ ] 在目标平台操作真实主流程。
- [ ] 更新能力矩阵和必要 ADR。
- [ ] 报告产物路径与 SHA-256。
- [ ] 明确未完成项，没有模糊使用“基本完成”。

---

## 十五、拒绝“伪完成”的验收规则

以下说法不能作为完成证据：

- “代码已经写好，但本机没有 SDK。”
- “npm run build 通过，所以 Android/Windows 已完成。”
- “原生 API 应该是这样。”
- “页面可以显示，所以播放功能完成。”
- “使用 FakeAudioEngine 模拟了播放。”
- “SQLite schema 已定义，所以持久化完成。”
- “有扫描类，所以本地导入完成。”
- “功能入口已隐藏，因此需求完成。”
- “单元测试通过，所以真机能力可用。”

完成证据必须是：目标平台构建成功 + 产物可安装/运行 + 真实数据主流程通过 + 自动化测试通过 + 限制明确。

---

## 十六、最终产品验收脚本

### Android

1. 在干净设备安装 Release/验收 APK。
2. 断开网络启动，不登录。
3. 授权一个包含正常、无标签、无封面、损坏和重复文件的测试目录。
4. 检查扫描进度和结果统计。
5. 重启应用，确认曲库存在。
6. 按歌曲、专辑、歌手和文件夹浏览；搜索一首歌曲。
7. 播放真实音频，执行暂停、seek、上一首、下一首、随机、循环。
8. 建立歌单、收藏歌曲，重启后确认保留。
9. 息屏并通过通知、耳机按键操作。
10. 切换应用、制造音频焦点冲突、拔耳机。
11. 杀 Activity/进程并恢复，确认队列和进度合理。
12. 移动、删除、重新加入文件，执行增量扫描。
13. 导出数据，在清洁测试环境导入并核对。

### Windows

1. 在无开发环境的干净 Windows 用户账户安装。
2. 拖入或选择测试文件夹。
3. 完成与 Android 相同的扫描、浏览、搜索和播放流程。
4. 测试 Ctrl+K、Ctrl+O、空格等快捷键及输入框焦点规则。
5. 测试右键菜单、窗口 900×600、4K 150%、多显示器。
6. 测试任务栏 SMTC、托盘和关闭策略。
7. 断网重启，确认本地曲库和播放能力完整。
8. 使用 Android 导出包测试兼容导入。

### 最终判定

只有两个平台的上述脚本均通过，才能称为“双平台本地播放器开发完成”。如果只有 Android 通过，应明确称为“Android MVP 完成，Windows 未完成”。

