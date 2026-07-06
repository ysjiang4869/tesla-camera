# 桌面 App（WKWebView）视频卡片白色边框残留问题

> 分支：`fix/wkwebview-card-white-border`
> 记录时间：2026-07-06
> 状态：**已解决** ✅ —— 根因见下方「根本原因」一节，修复见「最终修复」。前面尝试 1~6 全部无效，因为都在追错方向。

## 现象

- 侧边栏视频列表的卡片，**被点击/选择过之后，取消选择（切到别的卡片）时会留下一圈白色边框**。
- **只在桌面 App（Tauri，macOS WKWebView）出现；Web 端（Chrome）完全正常。**
- 与视频类型（事件/哨兵/记录仪）无关，任何被选过的卡片都会残留。
- 白框会随着点选过的卡片累积（点过几张就有几张带白框）。
- 运行方式：`pnpm app:dev`（连着 dev server `localhost:6680`，HMR 生效）。已确认同期其它代码改动（红点时间改事件时间）在 App 里能生效 —— 即改动确实进入了 WKWebView。

## 卡片相关代码位置

- 卡片组件：`src/app.tsx` 的 `ClipCard`（约 237 行起）。
- 卡片样式：`src/app.tsx` 的 `sidebarStyles.card` / `cardHover` / `cardActive`。
- 选中判定：`active = item.id === state.currentGroup?.id`，只可能有一张 active。
- 颜色体系：`src/index.css` 用 **oklch** 定义 CSS 变量。

关键点：代码里**没有任何**「事件卡片专属边框」或「选过就加边框」的样式；非选中态卡片的边框是 `border: '1px solid transparent'`，选中态是蓝色边框。理论上取消选中后应恢复透明边框、无残留。

## 已尝试方案与结果

| # | 假设 | 改动 | 结果 |
|---|------|------|------|
| 1 | 浏览器/控件默认 focus outline | 在 `sidebarStyles.card` 加 `outline: 'none'` | ❌ 仍存在 |
| 2 | 全局按钮原生外观（Aqua）+ focus | `src/index.css` 给 `button` 加 `-webkit-appearance: none; appearance: none; -webkit-tap-highlight-color: transparent;` 及 `button:focus { outline: none }` | ❌ 仍存在 |
| 3 | 按钮点击后保留焦点、WKWebView 画原生焦点环 | 卡片 `onClick` 里加 `e.currentTarget.blur()` | ❌ 仍存在（随后撤回） |
| 4 | `border-color` 过渡到 `transparent` 时 WKWebView 对 oklch→transparent 插值有 bug，卡在灰白残留 | `transition` 去掉 `border-color`，只留 `background` | ❌ 仍存在 |
| 5 | 选中态 `boxShadow`（oklch 内外描边）移除时 WKWebView 不重绘、缓存成白环 | 删除 `cardActive` 的 `boxShadow`，改用更明显边框（透明度 0.4→0.9） | ❌ 仍存在 |
| 6 | 原生 `<button>` 的系统焦点/高亮环，且移除时不重绘 | 卡片 `<button>` → `<div role="button">`，`ref` 改 `HTMLDivElement` | ❌ 仍存在 |

## 验证过的事实

- 在 Web（Chrome，localhost:6680）注入一个 `outline:none` 的按钮并 focus，computed `outline` 确为 `none`，**无任何可见边框** → 证明 Web 端 focus 机制已被压住，Web 端本就正常。
- 用 `browser_batch`/`javascript_tool` 只能连到独立的 Chrome 会话，**无法连到 Tauri 的 WKWebView 进程**，因此无法直接在 App 里 inspect computed style / DOM —— 这是当前排查的最大障碍。

## 关键矛盾点（供后续排查）

1. **白色** —— 尝试 5 之后选中态边框已是蓝色（oklch 220），残留却仍是「白色」。说明残留物**很可能不是卡片自身的 border/box-shadow**（否则应是蓝色残留）。
2. **能累积** —— 多张卡片同时残留，排除了「单一焦点元素」（focus 只可能一个）。指向某种**逐卡片、开启后不关闭**的可视状态，或 WKWebView 的**重绘/失效（invalidation）bug**：某个视觉一旦画上去，移除时不触发重绘。
3. 改成 `<div>` 后仍在 → 不是原生 `<button>` 控件外观问题。

## 根本原因（在 App 内 inspect 后定位）

开启 devtools 后检查残留白框的卡片,发现两条决定性证据:

1. 命中的卡片 `div` computed style 里 `border-width: 1px; border-style: solid;` **唯独没有 `border-color`**。
2. React 控制台警告:
   > Warning: Removing a style property during rerender (borderColor) when a conflicting property is set (border) can lead to styling bugs. To avoid this, don't mix shorthand and non-shorthand properties for the same value.

**机制**：
- 基础样式 `sidebarStyles.card` 用了 **shorthand** `border: '1px solid transparent'`。
- 选中样式 `sidebarStyles.cardActive` 用了 **longhand** `borderColor: 'oklch(...)'`。
- 选中 → 取消选中时,React 把 `borderColor`(longhand)从内联 style 上**删除**。由于它和 shorthand `border` 混用,删除后 `border-color` **没有回落到 shorthand 里的 `transparent`**,而是变成 CSS 默认值 `currentColor`。
- 卡片 `color: var(--fg-1)`(浅灰,接近白),于是边框就按这个颜色画出来 = **看到的白框**。

**为什么只在 App(WKWebView)出现**：这是「混用 shorthand/longhand + 删除 longhand」的未定义/边界行为,Chrome(Web)碰巧把 border-color 重置掉了,WKWebView 没有,残留成 currentColor 白框。

**为什么前 6 次尝试全无效**：它们都在处理 focus 环 / box-shadow / 原生控件外观 / 过渡插值,而真正的白框根本不是这些——是 border-color 回落到 currentColor。所以删 box-shadow(残留仍是白而非蓝)、改 div 都没用,这两点在「关键矛盾点」里其实已经指向了它。

## 最终修复

`src/app.tsx` 的 `sidebarStyles.card`：把 `border` shorthand 拆成 longhand,让 `borderColor` 始终显式存在——

```diff
-    border: '1px solid transparent',
+    borderWidth: 1,
+    borderStyle: 'solid',
+    borderColor: 'transparent',
```

这样取消选中时,`cardStyle` 里始终带着 `borderColor: 'transparent'`(来自基础 `card`),React 只是把值从蓝色改回 `transparent`,**不会删除该属性**,自然不会回落到 currentColor。白框消失,React 警告也消失。

前面尝试 1~6 的实验性改动(outline、appearance、blur、去 box-shadow、div 化等)均已回退,分支只保留这一处真正修复(以及 `src-tauri/src/main.rs` 里 debug 自动开 devtools 的便利改动,可按需保留/删除)。

## 下一步建议（历史记录，问题已解决时可忽略）

1. **直接在 App 里 inspect**（最关键）：给 Tauri 开启 devtools（`tauri.conf.json` 里 `"devtools": true` 或右键检查），在 WKWebView 里选中→取消一张卡片，直接看那圈白框到底是哪个元素的什么属性（border / outline / box-shadow / ::before / 背景），以及 computed style。目前所有推断都是盲猜，拿到这个就能定位。
2. 若确认是 WKWebView 重绘 bug：可试**强制重绘**（切换 active 时改动一个无害属性触发 layout/repaint，如短暂 `transform: translateZ(0)` 或读一次 `offsetHeight`），或给卡片加 `will-change` / `contain: paint`。
3. 检查是否有**全局** `:focus` / `::selection` / macOS「聚焦高亮」相关样式，或 Fluent UI（`makeStyles`）注入的样式在 WKWebView 下表现不同。
4. 排查白框是否来自**缩略图 `<img>`/`thumb`**（`border: 1px solid var(--line-soft)`）或某个伪元素，而非卡片本体。
5. 确认 WKWebView 版本 / macOS 版本，查是否为已知 WebKit oklch / 重绘缺陷。

## 当前 working tree 改动（相对 main）

- `src/app.tsx`：
  - 红点时间取事件时间（`item.event ?? item.time`）—— 与本 bug 无关，属另一需求。
  - `card` 样式加 `outline: 'none'`；`transition` 去掉 `border-color`。
  - `cardActive` 删除 `boxShadow`，`borderColor` 透明度 0.4→0.9。
  - 卡片 `<button>` → `<div role="button">`，`ref` 类型 `HTMLButtonElement`→`HTMLDivElement`。
- `src/index.css`：`button` 加 `appearance: none` 等 + `button:focus { outline: none }`。

以上尝试均**未解决**白框问题，保留仅因无副作用；真正原因仍需在 App 内 inspect 后确认。
