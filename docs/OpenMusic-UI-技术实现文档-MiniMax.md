# OpenMusic UI 技术实现文档（供 MiniMax 执行）

> 版本：V2.0  
> 日期：2026-10-09  
> 前置文档：`docs/OpenMusic-UI-产品需求文档.md`  
> 技术前提：本地优先；Android 与 Windows 双平台；优先复用现有 ReactLynx 技术栈，不得默认浏览器 DOM/CSS/第三方 Web UI 库可用

## 1. 实施目标

在现有 OpenMusic 仓库中完成新版移动端 UI。先检查已有依赖、Lynx/ReactLynx 版本、路由、播放器和数据层，再增量改造；不得为追求视觉效果破坏已有可用播放能力。以原子 Token + 项目自有组件实现，不直接引入 Ant Design、MUI、Chakra、Tailwind UI 等 Web UI 库。

## 2. 执行规则

1. 修改前阅读仓库 `README`、`package.json`、构建配置和所有 `AGENTS.md`。
2. 保留用户已有改动；不要重置工作区或批量重写无关文件。
3. 只使用当前 ReactLynx 版本明确支持的元素、样式和事件；不确定时查项目类型定义或官方文档。
4. 优先复用现有 API、播放器、图片、图标和状态层；新增依赖前说明必要性。
5. 每完成一个阶段即运行类型检查、测试、lint 和构建；修复由本次修改引入的问题。
6. P0 功能不允许仅做静态稿；后端暂缺时使用可替换的 Mock Repository，并清晰标注边界。

## 3. 建议目录

根据现有工程适配命名，不要机械创建重复层：

```text
src/
  app/                 # 启动、路由、Providers
  design/              # tokens、theme、typography
  components/          # 通用无业务组件
  features/
    home/
    search/
    library/
    player/
    playlist/
    artist/
    settings/
  services/            # API、repository、缓存、埋点
  store/               # 全局状态与 selectors
  types/               # 领域模型
  utils/
```

业务组件只依赖 `components`、领域 service/store 和 tokens；通用组件不得反向依赖业务 feature。

## 4. 设计 Token

建立唯一 Token 来源，组件中禁止散落品牌色与随意间距：

```ts
export const colors = {
  dark: {
    background: '#0F1012', surface: '#18191D', surfaceRaised: '#232429',
    textPrimary: '#F7F7F8', textSecondary: '#A7A8AE', textMuted: '#73757D',
    border: '#303139', brand: '#E83B45', onBrand: '#FFFFFF',
    success: '#39B980', warning: '#F5A524', error: '#F04444',
  },
};
export const spacing = { x1: 4, x2: 8, x3: 12, x4: 16, x6: 24, x8: 32 };
export const radius = { sm: 6, md: 10, lg: 14, pill: 999 };
export const typeScale = {
  display: { fontSize: 24, lineHeight: 30 },
  section: { fontSize: 20, lineHeight: 26 },
  body: { fontSize: 16, lineHeight: 22 },
  caption: { fontSize: 13, lineHeight: 18 },
};
```

补充 `Theme` 类型和 `useTheme()`；即使首期只上线深色，也必须让颜色从主题注入。安全区、底部导航高度、迷你播放器高度设为布局常量。

## 5. 领域模型与接口

```ts
type ID = string;
interface ArtistRef { id: ID; name: string; avatarUrl?: string }
interface AlbumRef { id: ID; title: string; coverUrl: string }
interface Track {
  id: ID; title: string; artists: ArtistRef[]; album?: AlbumRef;
  coverUrl: string; durationMs: number; playable: boolean;
  audioUrl?: string; explicit?: boolean;
}
interface Playlist {
  id: ID; title: string; description?: string; coverUrl: string;
  creatorName?: string; trackCount?: number; tracks?: Track[];
}
interface LyricLine { startMs: number; endMs?: number; text: string; translation?: string }
interface PageResult<T> { items: T[]; nextCursor?: string; hasMore: boolean }
```

Repository 契约至少包含：

```ts
interface MusicRepository {
  getHome(): Promise<HomePayload>;
  search(query: string, type?: SearchType, cursor?: string): Promise<SearchPayload>;
  getPlaylist(id: ID): Promise<Playlist>;
  getAlbum(id: ID): Promise<AlbumDetail>;
  getArtist(id: ID): Promise<ArtistDetail>;
  getLyrics(trackId: ID): Promise<LyricLine[]>;
  getLibrary(): Promise<LibraryPayload>;
  setLiked(trackId: ID, liked: boolean): Promise<void>;
}
```

API DTO 到领域模型必须经过 mapper，页面不能直接消费后端字段。所有请求统一返回可区分的 `loading/success/empty/error` 状态，并支持请求取消或忽略过期响应。

## 6. 全局状态

仅把跨页面状态放入全局：

- `navigationStore`：当前 Tab、各 Tab 子栈/滚动恢复信息。
- `playerStore`：currentTrack、context、queue、index、status、positionMs、durationMs、mode、volume、error。
- `libraryStore`：likedTrackIds、收藏变更同步状态。
- `sessionStore`：用户、主题、设置、网络状态。

页面列表、搜索输入、局部弹窗保持局部状态。为 Player 建立细粒度 selector，避免进度每秒变化导致整个应用重渲染。

播放器状态机建议：

```text
idle -> loading -> playing <-> paused
                  |   |
                  v   v
                buffering
任意可播放态 -> error -> retry/loading
```

播放器 service 是音频引擎的唯一调用入口；UI 只 dispatch intent。引擎事件反向更新 store，禁止多个页面各自维护“是否播放”。进度 UI 可 250–500ms 更新一次。

## 7. 导航与页面壳

实现 `AppShell`：内容区域 + 常驻 `MiniPlayer` + `BottomTabs`。迷你播放器仅在有当前曲目时占位。底部安全区通过运行时能力读取；不得以单一机型数值写死。

路由键建议：`home`、`search`、`library`、`profile`、`playlist/:id`、`album/:id`、`artist/:id`、`now-playing`、`queue`、`settings`。详情页入参只传 ID，由页面查询或从缓存读取；避免把大对象塞入导航参数。

## 8. 组件清单

先完成组件，再组装页面：

- 基础：`Screen`、`Text`、`Icon`、`Pressable`、`Divider`、`Spacer`。
- 反馈：`Skeleton`、`EmptyState`、`ErrorState`、`Toast`、`ConfirmDialog`。
- 内容：`Artwork`、`MediaCard`、`MediaRow`、`TrackRow`、`SectionHeader`、`HorizontalShelf`。
- 输入：`SearchField`、`Chip`、`SegmentedTabs`、`Slider`（确认 Lynx 能力，不可用则自建）。
- 播放：`MiniPlayer`、`PlaybackControls`、`ProgressBar`、`LyricsView`、`QueueList`。
- 导航：`TopBar`、`BottomTabs`、`BottomSheet`（运行时不适合手势拖拽时降级为全屏浮层）。

所有可交互组件必须定义 normal/pressed/disabled/loading/selected 状态，触控区 ≥ 44×44，并暴露语义标签。

## 9. 页面落地顺序

### 阶段 A：基础设施

盘点工程 → tokens/theme → 领域类型 → Repository → Store → AppShell → 错误边界。用 8–12 首合规占位数据打通视觉开发。

### 阶段 B：播放闭环

`TrackRow` 点击 → 构建上下文队列 → 音频加载 → MiniPlayer → NowPlaying → 进度/seek → 上一首/下一首 → 播放模式 → Queue → Lyrics。优先保证单一状态源和后台恢复。

### 阶段 C：核心发现

Home 货架、详情页、图片缓存/占位、分页加载、当前播放高亮。不得在横向货架内嵌套冲突的横向手势。

### 阶段 D：搜索与音乐库

搜索防抖和竞态处理；聚合结果与分类结果；收藏乐观更新、失败回滚；筛选和空态。

### 阶段 E：质量与润色

浅色主题（P1）、封面取色（运行时支持再做）、动效、可访问性、埋点、性能分析、全状态截图验收。

## 10. 关键实现细节

### 10.1 列表与图片

- 使用 ReactLynx 推荐的可复用/虚拟列表能力，提供稳定 key；禁止索引作为内容 key。
- 封面组件统一处理占位、失败、淡入、尺寸和圆角；请求接近展示尺寸的资源。
- 页面分页需去重 ID；刷新与加载更多互斥；过期响应不得覆盖新请求。

### 10.2 搜索

- 输入去首尾空格；空查询不请求。
- 300ms 防抖，query 变化取消/废弃上一请求。
- 搜索历史最多 20 条，去重、最新优先，本地持久化。
- 不将原始搜索词发送到通用日志；埋点按隐私策略处理。

### 10.3 歌词同步

歌词按 `startMs` 排序；用二分查找当前行，避免每 tick 全表扫描。用户开始滚动后暂停自动居中 4 秒，显示回到当前行按钮。无时间戳歌词按纯文本展示；无歌词显示明确空态。

### 10.4 持久化与恢复

本地保存当前曲目 ID、上下文 ID、队列 ID、index、position、播放模式、主题和搜索历史。启动恢复时先显示元数据，再异步校验资源；不要自动出声播放，除非产品和平台策略明确允许。

### 10.5 错误处理

统一 `AppError`：`network | unauthorized | unavailable | timeout | unknown`。面向用户使用中文可行动文案；技术详情只进调试日志。播放失败时保留队列，允许重试或跳到下一首。

## 11. ReactLynx 约束检查

- 不使用 `window`、`document`、DOM 测量、CSS 伪类、Web Storage 或浏览器音频 API，除非项目已有兼容层。
- 不假设 `position: sticky`、复杂滤镜、backdrop blur、CSS Grid、hover、SVG 动画可用。
- 阴影、渐变、文本行数、手势、动画和安全区必须在目标设备验证。
- 需要平台能力时封装为 adapter，不让页面直接调用 Native 模块。
- 视觉降级优先保证文字可读、点击可用和播放连续。

## 12. 测试策略

### 单元测试

- DTO mapper、队列增删/重排、播放模式、歌词行定位、搜索防抖、收藏回滚。

### 组件测试

- `TrackRow` 状态、`MiniPlayer` 同步、错误/空态、长标题、不可播放歌曲、主题切换。

### 集成测试

- 首页播放到全屏播放器；搜索到详情再播放；收藏后音乐库出现；队列切歌；播放错误重试；应用恢复。

### 人工设备矩阵

- 360/390/430dp 宽度；小屏与长屏；Android 主版本至少覆盖项目最低版和当前主流版。
- 弱网、断网、图片失败、API 慢响应、超长中文/英文、空数据、1000 首列表。
- 后台/前台、音频焦点、耳机拔出（若原生层支持）。

## 13. 完成定义（DoD）

- 产品文档 P0 全部实现，未实现项有清晰记录且界面无假入口。
- 类型检查、lint、测试、正式构建通过；新增关键逻辑有测试。
- 播放器只有一个事实来源，三个播放入口状态一致。
- 所有页面覆盖 loading/empty/error/success；无未捕获异常和明显内存泄漏。
- 无竞品商标或复制素材；图标和图片来源可追溯。
- 输出变更清单、架构说明、运行命令、验证结果、已知限制和后续建议。

## 14. 给 MiniMax 的执行提示词

```text
请依据 docs/OpenMusic-UI-产品需求文档.md 和
docs/OpenMusic-UI-技术实现文档-MiniMax.md 实施 OpenMusic 新版 UI。

先只读检查仓库，汇报现有架构、ReactLynx 版本、可复用模块、风险和分阶段计划；
随后直接从 P0 开始增量实现，不要引入 Web UI 库，不要使用未经验证的 DOM/CSS API，
不要覆盖无关改动。每完成一个阶段运行现有 typecheck、lint、test 和 build。
如后端接口缺失，建立类型明确、可替换的 Mock Repository，不要把 Mock 数据写进页面组件。
最终提交：修改文件清单、完成/未完成需求、测试结果、启动方式、截图或可验证说明、已知限制。
```

## 15. 外部规范提示

若未来真正接入 Spotify API，必须单独审查其开发者政策和设计规范，包括内容归属、封面不得裁切/覆盖、元数据可读性、回链以及品牌不得暗示合作。本次仅借鉴通用体验，不使用 Spotify 数据或品牌资产。

## 16. V2 总体架构：本地优先、双平台共享

采用“共享领域核心 + 平台适配器 + 平台化 UI 壳”架构。不能为了共享率把 Android 和 Windows 强行做成同一布局，也不能让平台实现渗入业务模型。

```text
UI (Android shell / Windows shell)
        ↓ intents / view models
Application (use cases, stores, sync orchestration)
        ↓ ports
Domain (Track, Album, Playlist, Queue, rules)
        ↓ interfaces
Infrastructure
  ├─ local database
  ├─ media scanner / metadata reader
  ├─ audio engine
  ├─ secure storage
  ├─ optional sync client
  └─ optional content providers
```

依赖只能向内：Domain 不依赖 UI、平台 API、网络 SDK 或数据库实现。所有原生能力通过 TypeScript interface/bridge port 暴露，并具有可测试的 fake 实现。

## 17. 平台能力探测与技术决策门

实施前必须输出 `docs/platform-capability-matrix.md`，实机验证以下项目：

| 能力 | Android | Windows | 降级方案 |
|---|---|---|---|
| 音频解码格式 | 实测记录 | 实测记录 | UI 仅展示已支持格式 |
| 后台/系统媒体控制 | Media Session | SMTC 或项目等效层 | 保留应用内控制 |
| 目录授权与持久访问 | SAF/MediaStore 等实际方案 | 文件夹选择器 | 单文件导入 |
| 文件变更监听 | 平台允许范围内 | FileSystemWatcher 等适配 | 手动/定时增量扫描 |
| SQLite/事务 | 验证驱动 | 验证驱动 | 不允许内存数据库上线 |
| 安全存储 | Keystore | Credential/DPAPI 等适配 | 禁止明文 token |
| 托盘、拖放、快捷键 | 不适用 | 实测 | 菜单入口替代 |

任何关键能力未验证前不得编造 API。若现有 ReactLynx Windows 支持不满足要求，先提交最小技术原型与决策记录，再选择：继续 ReactLynx、增加薄原生壳，或让 Windows 使用独立呈现层但共享领域协议。该选择属于架构决策，不得在页面代码中临时打补丁。

## 18. 本地数据库

SQLite 为权威元数据源，音频文件仍是媒体内容源。建议表：

```text
tracks(id, file_identity, path, title, album_id, duration_ms,
       size_bytes, modified_at, content_hash, availability, added_at, updated_at)
artists(id, name, normalized_name)
albums(id, title, album_artist_id, year, artwork_key)
track_artists(track_id, artist_id, role, position)
playlists(id, name, type, created_at, updated_at, deleted_at)
playlist_items(id, playlist_id, track_id, position, added_at, deleted_at)
favorites(entity_type, entity_id, created_at, deleted_at)
play_history(id, track_id, started_at, completed, position_ms)
lyrics(track_id, source, language, content, parsed_json, updated_at)
scan_roots(id, platform, uri, display_name, permission_state, last_scan_at)
scan_runs(id, started_at, finished_at, status, stats_json)
settings(key, value_json, updated_at)
sync_changes(id, entity_type, entity_id, operation, payload_json, version, created_at)
```

要求：

- 数据库必须有 `schema_version` 和逐版本 migration；升级失败保留原库并提供恢复路径。
- 外键、唯一索引和常用查询索引明确配置；歌名/歌手/专辑建立规范化搜索列或 FTS。
- 扫描批量写入使用事务，每批大小经性能测试确定；取消扫描不得留下半成品关系。
- UI 不直接拼 SQL；Repository 返回领域对象或分页投影。
- 播放进度节流写入，避免高频磁盘写；关键切歌/暂停/退出事件立即落盘。

## 19. 媒体扫描与文件身份

```ts
interface MediaScannerPort {
  selectRoots(): Promise<ScanRoot[]>;
  scan(root: ScanRoot, cursor?: ScanCursor): AsyncIterable<DiscoveredFile>;
  stat(ref: FileRef): Promise<FileStat>;
}
interface MetadataReaderPort {
  read(ref: FileRef): Promise<MediaMetadata>;
}
```

扫描流水线：枚举候选文件 → 扩展名/签名初筛 → stat 对比 → 读取媒体信息 → 生成身份与指纹 → 映射实体 → 事务 upsert → 更新搜索索引 → 生成扫描报告。

文件身份优先采用平台稳定 ID；否则组合规范路径、大小、修改时间和分段哈希。不要首次扫描就对所有大文件计算全量哈希。路径比较规则按平台处理大小写，数据库同时保留用户可读路径和规范标识。

并发读取需有限制，可取消并可恢复。坏文件、权限撤回、超长路径、网络盘、可移动盘和重复文件都必须成为可观测的结果，不能让整个扫描失败。

## 20. 音频引擎端口与生命周期

```ts
interface AudioEnginePort {
  load(source: PlayableSource, startMs?: number): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setVolume(value: number): Promise<void>;
  dispose(): Promise<void>;
  subscribe(listener: (event: AudioEvent) => void): Unsubscribe;
}
```

Application 层的 `PlayerCoordinator` 是唯一编排者，负责队列、重试、预加载、音频焦点、媒体按钮和持久化。平台音频回调统一转换为带序号的领域事件，过期 load/play 回调不得覆盖新曲目状态。

Android 播放服务必须独立于 React 页面生命周期；Windows 关闭窗口/最小化托盘策略通过平台生命周期适配器通知 Coordinator。应用恢复时读取快照，不默认自动发声。

## 21. Provider 插件边界

本地资料库使用 `LocalMusicRepository`。在线内容不能混入本地文件表的语义，应由 Provider 协议提供统一只读投影：

```ts
interface ContentProvider {
  id: string;
  capabilities(): ProviderCapabilities;
  search(query: string, cursor?: string): Promise<PageResult<RemoteTrack>>;
  resolve(id: string): Promise<ResolvedPlayable>;
  getLyrics?(id: string): Promise<LyricLine[]>;
}
```

所有远程实体 ID 使用 `{providerId}:{remoteId}` 命名空间。Provider 必须具备超时、熔断、限流、注销和权限撤回处理；凭据进入平台安全存储。不要以插件名义加载未经信任的任意脚本。商业 Provider 必须通过编译期注册、签名或受控清单接入。

## 22. 可选同步架构

同步是 M3 能力，M1 不得依赖服务器。采用本地操作日志/outbox：本地事务同时更新业务表与 `sync_changes`，后台任务批量上传；服务端确认后推进 checkpoint。

- 每个实体有稳定 UUID、版本和更新时间；设备 ID 只用于同步诊断。
- 收藏与歌单项目采用 tombstone，防止离线删除后被旧设备复活。
- 同步 payload 版本化；未知新字段应向前兼容。
- 传输使用 TLS，敏感令牌安全存储；服务端数据需有访问控制和审计。
- 默认不同步音频文件。若未来支持云盘，必须另做分片、校验、配额、版权与成本设计。

## 23. 双平台 UI 工程组织

建议扩展目录：

```text
src/
  domain/                 # 纯模型和规则
  application/            # use cases、coordinators、ports
  infrastructure/
    database/
    scanner/
    audio/
    providers/
    sync/
  ui/
    shared/                # tokens、无平台语义的展示组件
    android/               # BottomTabs、NowPlayingScreen、移动手势
    windows/               # Sidebar、NowPlayingPane、桌面菜单/快捷键
  platform/
    android/
    windows/
```

共享组件必须通过 props 接收行为；平台壳决定导航与组合。断点由明确布局策略驱动，不用到处读取窗口宽度。Windows 键盘事件集中注册并按焦点上下文分发，禁止每个页面重复监听。

## 24. 性能预算

- 1 万首曲库作为基准数据集，另用 5 万首压力集验证索引和分页。
- 查询必须分页；列表只渲染可见区域；封面缩略图分尺寸缓存并设置磁盘上限。
- 冷启动不进行全库扫描；先显示本地快照，再后台增量检查。
- 搜索目标：输入防抖后，本地结果 P95 ≤ 200ms（基准设备、1 万首）。
- 切歌 UI 反馈 ≤ 150ms；本地音频开始目标 P95 ≤ 500ms。
- 扫描不得长期占满 CPU/IO；前台、后台和电量状态采用不同并发策略。
- Store 中不得保存大列表的重复副本；以 ID、分页查询与 memoized selector 组合。

## 25. 数据安全与可恢复性

- 原文件默认只读；任何写标签或删除操作使用独立能力开关和确认流程。
- 数据库迁移前创建可恢复备份，保留数量和空间上限明确。
- 导出包包含 manifest、schema version、歌单、收藏、编辑元数据和设置，不默认包含音频。
- 导入先校验版本、大小、校验和，再用事务合并；不可直接覆盖当前数据库。
- 日志对路径、用户名、令牌、搜索词和设备标识脱敏。
- crash-safe：队列、播放进度和同步 outbox 的写入必须可在异常退出后恢复。

## 26. 测试扩展

新增以下自动化测试：

- 数据库 migration 从每个已发布版本升级；升级失败回滚。
- 扫描幂等性、移动识别、重复文件、坏标签、权限撤回和取消恢复。
- 1 万/5 万首性能基准，检测慢查询和内存回归。
- PlayerCoordinator 的竞态：快速连点切歌、旧回调、seek 后切歌、焦点丢失。
- Android 服务重建、通知按钮和音频焦点集成测试。
- Windows 拖放、快捷键焦点、托盘生命周期和缩放布局测试。
- 同步属性测试：重复上传幂等、离线编辑、删除墓碑、不同顺序收敛。
- 导出—清空测试环境—导入后的数据等价性测试。

不得在用户真实音乐目录运行破坏性测试。媒体集使用临时目录和生成的短音频样本。

## 27. MiniMax 分阶段执行指令（V2）

```text
目标：依据两份 V2 文档实现本地优先的 Android/Windows OpenMusic。

第一阶段只读审计并提交：
1. 当前目录结构、依赖、ReactLynx 与平台构建能力；
2. 已有音频、数据库、扫描、路由和状态模块；
3. Android/Windows capability matrix；
4. 与 V2 目标的差距、风险、ADR 和可回滚实施计划。

审计后按 M0 → M1 实施。先打通“选择目录—扫描—入库—搜索—播放—后台恢复”，
再做推荐外观和在线能力。使用端口隔离平台代码，SQLite 是本地元数据权威源，
原音频默认只读。不得伪造未验证的 ReactLynx/原生 API，不得把 Mock、SQL 或平台调用写入页面。

每个阶段必须提供：变更文件、migration、自动化测试、Android/Windows 构建结果、
实机或可复现实验记录、性能数据、未完成项和回滚方式。发现 Windows 能力缺口时先写 ADR，
提出 ReactLynx、薄原生壳或独立呈现层的证据化比较，未经确认不要大规模换栈。
```

## 28. V2 完成定义

- 两个平台均可无账号、无网络完成导入、检索、播放、队列、歌单和歌词主流程。
- capability matrix 中所有 P0 能力有实测结论和降级方案。
- 数据库 migration、备份、导入导出通过测试；扫描不会擅自更改源文件。
- Android 后台播放和 Windows 系统集成不依赖 UI 页面存活。
- 1 万首曲库达到性能预算，5 万首压力测试无崩溃或数据损坏。
- Provider 与同步保持可选；关闭或故障时本地功能无行为退化。
- 构建、lint、类型检查、单元/集成测试全部通过，已知限制明确记录。

