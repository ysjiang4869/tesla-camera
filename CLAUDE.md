# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tesla Camera is a cross-platform Tesla dashcam video player built with React, TypeScript, and Tauri. It supports Windows, macOS, and web browsers (Chrome 86+) for viewing Tesla vehicle dashcam footage with 4-camera support (front, back, left, right).

**Architecture:** Dual-platform application sharing the same React codebase
- **Web:** Uses File System Access API, generates FFmpeg commands for manual export
- **Desktop:** Uses Tauri for native file access and direct FFmpeg integration

## Development Commands

### Prerequisites
- **pnpm >=8.0.0** (enforced)
- **Rust toolchain** (for Tauri desktop builds)
- Run `./init-binaries.sh` to download FFmpeg binaries for video export

### Web Development
```bash
pnpm dev              # Start dev server (port 6680)
pnpm build            # Build for web
pnpm preview          # Preview production build (port 3091)
```

### Desktop Development (Tauri)
```bash
pnpm app:dev          # Run Tauri dev mode
pnpm app:build        # Build desktop apps
pnpm build:tauri      # Build web bundle for Tauri
```

### Code Quality
```bash
pnpm lint             # Lint code (ESLint)
```

### Version Management
```bash
pnpm bump:version     # Automated version bumping script
```

**Git hooks:** Husky + lint-staged automatically run ESLint on commit. Commitlint enforces Angular-style commit messages.

## Architecture

### Platform Detection Pattern

The app uses `window.__TAURI_IPC__` to detect the runtime environment and conditionally render platform-specific components:

```typescript
{window.__TAURI_IPC__
  ? <FsSystem onAccess={onFileSystemAccess} />      // Tauri file picker
  : <DirectoryAccess onAccess={onFileSystemAccess} /> // Web file picker
}
```

### File Access Abstraction

Video files are accessed through the `FileData` interface (`src/model.ts`):
- **Web:** Uses File System Access API handles
- **Desktop:** Uses Tauri file system APIs
- Both implement a `get()` method that returns `{ url, name }` for lazy loading

**Memory Management:** Always revoke Object URLs when switching videos to prevent memory leaks:
```typescript
URL.revokeObjectURL(src_f)
```

### Video File Parsing Pipeline

Located in `src/app.tsx`, the core flow:
1. Recursive directory scan for video files
2. Regex filter for Tesla naming pattern: `YYYY-MM-DD_HH-MM-SS-*.mp4`
3. Group by timestamp prefix (first 19 characters)
4. Parse `event.json` files to mark event-related videos
5. Categorize into: 所有, 事件, 哨兵, 行车记录仪

**Tesla Camera Naming Convention:**
- Format: `YYYY-MM-DD_HH-MM-SS-<camera>-<timestamp>.mp4`
- Cameras: `front`, `back`, `left_repeater`, `right_repeater`
- Event metadata: `event.json` files in the same directory

### Component Structure

```
App (main container, state management)
├── Sidebar (video list with category tabs)
├── Header
│   ├── DirectoryAccess (web) / FsSystem (Tauri)
│   ├── FfmpegTerminal (web) / FfmpegExport (Tauri)
│   └── CheckUpdate
└── Player
    └── MiniPlayer (×4 cameras, one main + 3 previews)
```

**Player Synchronization:** Complex state sync between 4 video elements (play/pause, current time, camera selection) with delayed play mechanism for smooth switching.

## Key Files

- **src/app.tsx** - Root component with video parsing logic and state management
- **src/model.ts** - TypeScript interfaces and enums (TypeEnum, CameraEnum, ExportStatusEnum)
- **src/tool.ts** - Custom React hooks (useLock, useThrottle, useControl)
- **src/components/player.tsx** - Main 4-camera player component
- **src/components/mini-player.tsx** - Individual camera player with PIP support

## Build Configuration

**Rsbuild** (Rust-based bundler, faster than Webpack)
- Entry: `./src/main.tsx`
- Path alias: `@common` → `./src/common`
- Dev server: Port 6680 (matches Tauri devPath in `src-tauri/tauri.conf.json`)
- Output: `dist/` directory
- Environment modes: `web` (default) and `tauri` (for desktop builds)

**Tauri Configuration** (`src-tauri/tauri.conf.json`)
- Dev server: `http://localhost:6680`
- External binary: FFmpeg (sidecar, auto-downloaded via init-binaries.sh)
- Auto-updater: GitHub + Gitee endpoints
- Permissions: Full filesystem access, dialog, notifications

## Code Patterns

### Styling
- `makeStyles` from Fluent UI (CSS-in-JS)
- Responsive design with media queries
- Fluent UI design tokens for theming

### State Management
- Centralized in `App` component using React hooks (useState)
- Lifted state pattern for video selection
- No external state management library

### Type Safety
- Strict TypeScript mode enabled
- All data structures defined in `src/model.ts`
- Custom type definitions for File System Access API in `src/env.d.ts`

## Testing

**Note:** This project currently has no automated tests. Quality assurance relies on:
- TypeScript for type safety
- ESLint for code quality
- Manual testing via dev mode
- Husky pre-commit hooks for linting
