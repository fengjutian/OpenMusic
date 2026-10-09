# ADR-0002：进度条拖动的实现方式

- 状态：**已决策**
- 日期：2026-10-09
- 相关：技术实现文档 §7（"确认 Lynx 能力，不可用则自建"）、§11、§7.8

## 背景

产品需求 §7.8 要求：

> 拖动进度时即时显示目标时间，松手后 seek；请求失败恢复并提示。

三个选项：
1. 用 Lynx 内置 `slider` 元素；
2. 自建：用 `view` + `bindtouchstart/move/end`；
3. 不做拖动，只做点击跳转。

## 调研结果（实测，不是推测）

`node_modules/@lynx-js/types/types/common/element/` 下**没有 `slider.d.ts`**。
Lynx 在当前版本**不提供内置滑块元素**。这一条是读包得到的，不是查文档猜的。

但触摸事件提供了够用的信息：

```ts
// node_modules/@lynx-js/types/types/common/events.d.ts
export interface Touch {
  /** The current position of the touch point relative to the touched element's x-coordinate. */
  x: number;
  pageX: number;
  clientX: number;
  ...
}
```

`Touch.x` 是**相对被触摸元素**的坐标，正是进度条需要的。
唯一缺的是元素宽度——`@lynx-js/types` **没有任何布局测量 API**
（无 `measureLayout`、无 `onLayout` 返回尺寸）。

## 决策

**自建，且要求调用方传入 `trackWidth`。**

```ts
export interface ProgressBarProps {
  positionMs: number;
  durationMs: number;
  onSeek?: (positionMs: number) => void;
  /** 必需：Lynx 无法在运行时测量自身宽度 */
  trackWidth: number;
}
```

- `touches[0].x / trackWidth` 得到 0..1 的比例；
- 拖动中只更新本地状态（**不发 seek**，避免抖动和网络风暴）；
- `bindtouchend` 才真正 `onSeek(ratio * durationMs)`。

这与产品需求「拖动时即时显示目标时间，松手后 seek」完全一致。

## 理由

- 选项 3 违反 §7.8 的明确要求。
- 选项 1 不存在（没有 `slider` 元素）。
- 强行读 `window.innerWidth` 属于技术文档 §11 明令禁止的浏览器 API。

## 已知缺陷（接受）

`trackWidth` 是调用方给的常量，若容器宽度随窗口变化，必须由调用方同步更新。
当前 Android 走固定宽度（全屏播放页 320pt），Windows 侧在全宽布局下由
`WindowsShell` 计算后代入。**如果将来做自由拖拽窗口尺寸，需要重新评估。**

## 验证状态

已验证：类型正确（`npx tsc --build --force` 通过）、构建通过。
**未验证**：真机上的连续拖动手感。需在 §3 设备矩阵里补一条
「进度条拖动到 50% 松手，误差 < 1%」。