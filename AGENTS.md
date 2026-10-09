# Agent 指南（OpenMusic）

本文件给在这个仓库里工作的 AI 编码代理。人类贡献者请先读
[`README.md`](README.md)。

## 动手之前必须做的

1. 读 `README.md` 与 `docs/platform-capability-matrix.md`。
2. 跑一次 `npm run verify`，确认基线是绿的。
3. 确认你要改的文件属于哪一层（见 README 的目录结构）。

## 不可违反的约束

这些来自 `docs/OpenMusic-UI-技术实现文档-MiniMax.md`，违反它们等于交付无效：

1. **依赖只能向内。** `src/domain/` 不 import `application` / `infrastructure` /
   `ui` / `platform`。新增依赖前先想清楚方向。
2. **原生能力走端口。** 页面不得直接触碰 Native 模块。新增能力先在
   `src/domain/ports.ts` 加接口，再在 `infrastructure` 或 `platform` 实现。
3. **播放器只有一个事实来源。** `PlayerCoordinator` 是音频引擎唯一调用方。
   不要在页面里新增 `isPlaying` 状态。
4. **颜色只能来自 token**（`src/ui/shared/tokens.ts`）。禁止内联 `#RRGGBB`。
5. **禁止浏览器 API。** `window` / `document` / `localStorage` / Web Audio /
   CSS 伪类 / `position: sticky` / `backdrop-filter` 一律不用。
6. **不伪造未验证的 API。** 不确定某个 Lynx 属性是否存在时，先读
   `node_modules/@lynx-js/types/types/`，而不是猜。确实没有的（例如 `slider`）
   要自建并写 ADR。
7. **不要引入 Web UI 库**（Ant Design / MUI / Chakra / Tailwind UI）。
   也不要用 Tailwind 风格的属性名（`paddingHorizontal`、`flexShadow` 等）——
   它们不是 CSS，Lynx 的样式类型来自 `csstype`，会直接报错。
8. **Mock 不进页面组件。** 演示数据放在 `infrastructure`，通过
   `src/app/services.ts` 注入。
9. **未实现的功能不留假入口。** 能力没做，就在 `capabilities()` 里报 false，
   界面隐藏或显示为明确的禁用项。

## 常用命令

```powershell
npm run verify        # typecheck + lint + test + build，这是交付门槛
npm run typecheck
npm run lint
npm test
npm run build
node scripts/check-imports.mjs   # 检查断链导入
```

**批量改代码之后立刻跑 `npm run typecheck`**，不要攒到最后——
参见 `scripts/README.md` 里模板字符串被正则改坏的记录。

## 代码风格

- 2 空格缩进，单引号，分号。
- 文件顶部写清楚**为什么**这么写，尤其是和 Lynx 平台限制相关的地方。
- 注释写约束与取舍，不写「做了什么」。
- 面向用户的文案一律走格式化层（`src/domain/format.ts`），不在页面里拼接字符串。
- 文案不可由字符串拼接生成（产品需求 §9）。

## 加测试的时机

新增或修改以下逻辑时，**必须**补测试（技术需求 §12）：

- DTO mapper
- 队列增删 / 重排 / 播放模式
- 歌词行定位
- 搜索防抖与竞态
- 收藏乐观更新与回滚
- 数据库 migration（含失败回滚）
- `PlayerCoordinator` 的竞态

测试放在被测模块的 `__tests__/` 下，用 `@rstest/core`。

## 交付时要说的

按技术需求 §13，交付说明必须包含：
- 改了哪些文件
- 哪些需求完成了、哪些没完成
- 测试与构建结果
- 已知限制
- **未经验证的部分要显式说明，不要用「已完成」盖过去**