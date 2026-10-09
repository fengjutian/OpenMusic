# OpenMusic

> 本地优先、Android 与 Windows 双平台的音乐播放器。
> 技术栈：Lynx / ReactLynx，领域核心与 UI 在 TypeScript，平台能力通过端口注入。

## 当前状态

| 层 | 状态 |
|---|---|
| 领域层（模型、规则、端口） | ✅ 完成并测试 |
| 基础设施层（SQLite schema + 迁移器、Mock Repository、Fake 音频引擎、设置、安全存储接口） | ✅ 完成并测试 |
| 应用层（PlayerCoordinator、导航/曲库/会话 store） | ✅ 完成并测试 |
| UI 层（token、组件、Android 壳、Windows 壳） | ✅ 可构建 |
| Android 原生宿主 | ⚠️ **代码就绪但未编译**（本机无 Android SDK） |
| Windows 原生宿主 | ⚠️ **代码就绪但未编译**（本机无 MSVC） |

> 原生代码未经编译这件事被显式记录在
> [`docs/platform-capability-matrix.md`](docs/platform-capability-matrix.md)，
> 而不是藏在「已完成」里。请先读那份文档再决定下一步。

## 快速开始

```powershell
npm install
npm run verify        # typecheck + lint + test + build，四步全过才返回 0

npm run dev            # Android 形态的开发服务器
npm run dev:windows    # Windows 形态（左侧导航布局）
npm run build          # 产出 dist/main.lynx.bundle + dist/main.web.bundle

# Windows host（Edge / WebView2 直接加载同一份 web bundle）
npm run prepare:windows-host    # 拷贝 web-core + remote-web-worker 到 vendor/
npm run serve:windows-host      # http://127.0.0.1:4173/windows/host/index.html
```

单独运行某一环节：

```powershell
npm run typecheck      # tsc --build --force
npm run lint           # eslint .
npm test               # rstest run（76 个用例）
npm run build          # rspeedy build
```

## 目录结构

```
src/
  domain/            纯模型与规则。不 import 任何上层模块。
    models.ts          领域模型
    ports.ts           所有平台能力的 TypeScript 接口（端口）
    playback.ts        队列 / 播放模式规则（纯函数，已测）
    lyrics.ts          歌词行定位（二分查找，已测）
    search.ts          搜索规范化 / 历史 / 去重 / 相关度（已测）
    format.ts          时间、数量、文案格式化层
    errors.ts          AppError 单一错误分类

  application/       用例与协调者
    player-coordinator.ts   播放器唯一编排者（竞态已测）
    stores.ts               navigation / library / session
    create-store.ts         极简可观察 store

  infrastructure/    端口的实现
    database/             schema.ts（MIGRATIONS）+ migrator.ts + 内存 driver
    repository/           MockMusicRepository + 种子数据
    audio/                FakeAudioEngine（虚拟时钟）
    settings/             MemorySettings / MemorySecureStorage

  platform/          平台适配器（安全区、媒体按键、埋点）
  ui/
    shared/          token、主题、无业务组件、播放器组件、hooks
    android/         底部四 Tab 壳 + 全屏播放页 + 队列
    windows/         左侧导航壳 + 播放面板

android/             Gradle 原生宿主（未编译）
windows/             CMake 原生宿主（未编译）
docs/                产品需求、技术实现、能力矩阵、ADR
scripts/             一次性 codemod 与导入检查脚本
```

## 架构约束（改代码前先读）

1. **依赖只能向内。** `domain` 不依赖 `application` / `infrastructure` / `ui` / `platform`。
2. **原生能力一律走端口。** 页面永远不直接调用 Native 模块。
3. **播放器只有一个事实来源。** `PlayerCoordinator` 是音频引擎的唯一调用方；
   UI 只 dispatch intent，禁止任何页面自己维护「是否在播放」。
4. **颜色只能来自 token。** 组件里不得散落品牌色。
5. **不伪造未验证的 API。** 没有实测结论的能力，在 `capabilities()` 里报 false，
   界面据此隐藏入口，而不是放一个点了没反应的按钮。
6. **Mock 不进页面。** Mock Repository 在 `infrastructure`，通过 `getServices()` 注入。

## 不使用的东西

- Ant Design / MUI / Chakra / Tailwind UI —— 需求 §1 明令禁止。
- `window` / `document` / Web Storage / 浏览器音频 API —— §11。
- CSS 伪类（`:active` 之类）—— 按压态用 React state 实现。
- 内置 `slider` —— 当前 Lynx 版本没有该元素，见 [ADR-0002](docs/adr/0002-progress-bar-scrubbing.md)。

## 已知限制

- 原生宿主未经编译验证（详见能力矩阵）。
- 浅色主题已有 token，但原生窗口配色未同步，暂不作为可选项发布。
- Windows 快捷键、SMTC、拖放导入、托盘未完成。
- 歌词解析器、音频标签写回、云同步、商业 Provider 均未开始。