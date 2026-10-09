# OpenMusic 构建期一次性脚本

这些脚本是开发过程中为修正批量问题而写的，保留下来是为了让后来者能复现这些判断，
而不是重蹈覆辙。**它们不参与 `npm run verify`。**

| 脚本 | 作用 | 为什么保留 |
|---|---|---|
| `check-imports.mjs` | 列出所有断链的相对导入 | 批量改路径时最容易漏，逐个靠 tsc 报太慢 |
| `fix-imports.mjs` | 第一版导入路径修正 | 历史记录 |
| `codemod-styles.mjs` | 把 Tailwind 风格的 `paddingHorizontal` 等展开成 CSS 长写法 | 见下方「为什么」 |
| `codemod-styles2.mjs` | 第二轮：处理单行样式 + 把 `testID` 改名为 Lynx 认识的 `id` | 同上 |
| `repair-jsx-attrs.mjs` | 修正连字符属性的 JSX 写法 | 同上 |
| `repair-templates.mjs` | 修复上一轮破坏的模板字符串 | 同上 |
| `fix-types-round1.mjs` / `fix-types-round3.mjs` | 按 `@lynx-js/types` 实际接受的写法修正 | 同上 |
| `add-testid-attrs.mjs` | 把 `id` 同步为 `data-testid` | 见下方「为什么」 |

## 三个值得记住的教训

### 1. `paddingHorizontal` 不是 CSS

它是 **Tailwind 的约定**，不是 CSS 属性。第一稿代码里到处是它，
而 Lynx 的样式类型来自 `csstype`，因此全部报错。

> 这正是需求 §1「不要引入 Tailwind UI」想避免的问题的一种隐性表现——
> 就算不装 Tailwind，习惯性写法也会溜进来。

### 2. Lynx 的测试选择器是 `data-testid`，不是 `id`

- Lynx 运行时用 `id` 标识元素；
- `@lynx-js/react/testing-library` 的 `queryByTestId` 找的是 `data-testid`
  （见 `node_modules/@lynx-js/react/testing-library/dist/pure.js` 里的
  `testIdAttribute: 'data-testid'`）。

所以组件同时设置两者，用同一个 prop 驱动。

### 3. 正则改代码最容易伤到模板字符串

`paddingHorizontal: `${theme.spacing.x4}px`` 里含 `${`，
用 `[^,}\n]+` 匹配值的正则会在 `}` 处截断，把代码改成语法错误。
`repair-templates.mjs` 是那次事故的补救。

> **教训**：批量 codemod 之后必须立刻 `tsc --build --force`，
> 不要攒到最后。