# Tauri v2 迁移与性能重构方案

> 创建时间：2026-07-04
> 分支：`tauri-v2-migration`
> 目标：彻底解决打包 App 中行车记录仪缩略图/遥测加载缓慢甚至卡死的问题，并为长期维护打好架构基础。

## 一、问题背景与原因分析

**现象**：Web 版缩略图加载正常；打包后的 Tauri App 加载缓慢，行车记录仪（RecentClips）分类下甚至卡死。

**根因**（按严重程度排序）：

### 1. `readBinaryFile` 的 JSON IPC（"卡住"的主因）

Tauri v1 的 IPC 没有二进制通道。`fs-system.tsx` 中 `getBuffer()` 使用 `readBinaryFile`，
会把整个视频文件序列化成 JSON 数字数组（`[255,216,...]`），在 Rust 侧序列化、
再在 WebView 主线程 `JSON.parse`。一个 ~40MB 前置视频经此通道膨胀成 150MB+ 的 JSON
字符串，单次耗时数秒且完全阻塞 UI 线程。

`app.tsx` 的 `hydrateDashcam` 在点开分组后串行地对每个 clip 的前置视频做整文件读取。
行车记录仪分组 clip 数量最多（几十上百个 × 几十 MB），导致 UI 长时间假死 + 内存暴涨。
Web 版同样逻辑用的是原生 `file.arrayBuffer()`，所以没有问题。

### 2. 缩略图：每张图一个 ffmpeg 进程 + 每张图 4 次 IPC

`thumbnail-tauri.ts` 每个分组 spawn 一个 ffmpeg sidecar：

- 进程冷启动（macOS 上 100~300ms）+ ffmpeg 初始化，单张实际 0.5~1.5s；
  队列并发只有 2~4，几百个分组要跑数分钟；
- 每张图前置有 `appCacheDir`/`join`/`exists`（×2）共 4+ 次 IPC 往返；
- Tauri v1 的 `Command` 把 ffmpeg 每行 stderr（每次约 40 行）都作为事件经
  `evaluate_script` 灌回 WebView 主线程，与视频 `asset://` 协议流量争抢主线程。

### 3. 隐藏 bug：队列并发数可能为 NaN → 彻底卡死

`thumbnail-queue.ts`：`Math.max(2, Math.min(4, Math.floor(navigator.hardwareConcurrency / 2)))`，
若 WebView 不支持 `hardwareConcurrency` 则结果为 `NaN`，`running < NaN` 恒 false，
队列永不执行任何任务，所有缩略图永久停在占位图。

### 4. 次要因素

- 每 8 张缩略图触发整个侧边栏列表全量重渲染（无 memo、无虚拟化）；
- Tauri v1 asset 协议对 Range 请求处理性能差，影响视频播放流畅度。

## 二、方案选型

**结论：迁移 Tauri v2 + 所有重 IO/重计算下沉 Rust 端。**

- Tauri v1 已停止积极维护；v2 才有二进制 IPC、流式 asset 协议、插件化生态。
- 但仅升 v2 不够：正确的架构是**前端只要结果，字节永远不过 IPC**。
  v2 迁移是地基，Rust 下沉才是解决问题本身。

最终前后端契约（IPC 流量从 GB 级降到 KB 级）：

```
scan_teslacam(dir)        → 一次调用返回完整分组列表（含 event.json 解析）
request_thumbnails(paths) → Rust 端管缓存 + 批量 ffmpeg，经 Channel 逐张推送 jpg 缓存路径
parse_telemetry(path)     → Rust 读 mp4 box 解析遥测，只返回数据点 JSON（几 KB）
```

- 视频播放继续走 v2 asset 协议（v2 对 Range 请求做真正的流式处理）。
- ffmpeg 保留为 sidecar，但由 Rust 侧 `std::process::Command` 调用，
  不再有 stderr 事件灌回 WebView；导出功能一并受益。
- Web 版路径（`thumbnail.ts`、`directory-access.tsx`）保持不动，
  `FileData` 抽象继续作为两平台分界线。

## 三、分阶段实施

### 阶段 1：Tauri v2 迁移（地基）

- [ ] `tauri` 2.x + `@tauri-apps/api` 2.x；`fs`/`dialog`/`shell`/`notification`/`updater`
      改为官方插件（`@tauri-apps/plugin-*` + Cargo `tauri-plugin-*`）
- [ ] `tauri.conf.json` 重写为 v2 schema；allowlist 改为 capabilities/permissions 模型
- [ ] 平台检测：`window.__TAURI_IPC__` → `isTauri()`（`@tauri-apps/api/core`）
- [ ] `convertFileSrc` 改用官方 API（删除 `thumbnail-tauri.ts` 手写实现）
- [ ] `src-tauri/src/main.rs` 适配 v2 Builder/插件注册
- [ ] 更新 GitHub Actions 构建任务与 updater 配置
- [ ] 验收：功能与现状对齐（选目录、列表、播放、导出、检查更新），独立 commit

### 阶段 2：Rust 下沉（解决问题本身）

- [ ] `scan_teslacam`：目录递归、文件名正则分组、event.json 解析全在 Rust 完成，
      替代 `readDir(recursive)` 大 JSON + 前端循环 `readTextFile`
- [ ] `request_thumbnails`：Rust 维护缓存（内存 Set + 磁盘 jpg），未命中按 8~16 个
      一批调 ffmpeg（`-hide_banner -loglevel error -nostdin`），经 v2 Channel 逐张推送
      `asset://` URL；并发/取消用 tokio 管理；删除 `thumbnail-queue.ts`、`thumbnail-tauri.ts`
- [ ] `parse_telemetry`：把 `dashcam.ts` 的 `parseDashcamFromMp4`（mp4 box 遍历）移植到
      Rust；`hydrateDashcam` 改为只解析当前播放的 clip
- [ ] 验收：真实 TeslaCam 目录对拍——Rust 遥测输出与 TS 实现逐点一致；
      缩略图首屏 < 2s，全量后台完成且 UI 无卡顿

### 阶段 3：前端收尾

- [ ] 缩略图请求改为 IntersectionObserver 驱动（视口内才请求）
- [ ] `ClipCard` 加 `React.memo`，列表更新只换有变化的引用
- [ ] 清理 v1 时代的绕路代码与无用依赖

## 四、风险点

- **updater 升级链**：v1→v2 updater 格式有变化，老版本用户的自动更新路径需验证
  （保留 v1 最后一个 release 作为跳板，或接受一次手动升级）。
- **迁移量集中在配置和 import 路径**，业务逻辑改动不大；可用 `tauri migrate` CLI
  自动完成大部分。
- 遥测解析移植需真实 Tesla 视频对拍验证后再切换；TS 版实现保留给 Web 端使用
  （两份实现共存是合理的）。
