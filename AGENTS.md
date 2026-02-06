# Repository Guidelines

## Project Structure & Module Organization
- `src/`: React + TypeScript frontend.
- `src/components/`: UI and feature components (player, export, update check, filesystem access).
- `src/main.tsx` and `src/app.tsx`: app entry and composition root.
- `src-tauri/`: Rust/Tauri desktop wrapper (`src-tauri/src/main.rs`, `tauri.conf.json`, `binaries/`).
- `public/`: static web assets.
- `scripts/`: maintenance scripts (for example `scripts/bump-version.js`).
- `.github/workflows/`: CI/release pipelines.

## Build, Test, and Development Commands
- `pnpm install`: install JS dependencies (pnpm 8+ required).
- `pnpm dev`: run web dev server via Rsbuild.
- `pnpm build`: build web assets.
- `pnpm preview`: preview production web build on port `3091`.
- `pnpm app:dev`: run Tauri desktop app in development.
- `pnpm app:build`: build desktop bundles.
- `pnpm lint`: lint `src/**/*.ts(x)` with zero warnings allowed.
- `sh init-binaries.sh`: download/copy `ffmpeg` binaries required for desktop packaging.

## Coding Style & Naming Conventions
- Language mix: TypeScript/TSX (frontend) and Rust (Tauri host).
- Follow ESLint config in `.eslintrc.cjs` (`@mario34/eslint-config-react`).
- Use 2-space indentation and existing import/style patterns in `src/`.
- Prefer file naming aligned with current code: kebab-case component files (for example `mini-player.tsx`).
- Keep React components functional and focused; colocate feature UI under `src/components/`.

## Testing Guidelines
- No committed automated test suite currently (`test` script is not defined).
- Minimum gate before PR: `pnpm lint`, `pnpm build`, and manual verification in `pnpm dev` or `pnpm app:dev`.
- If adding tests, place them as `*.test.ts`/`*.test.tsx` near source or under a new `tests/` folder, and add a `pnpm test` script.

## Commit & Pull Request Guidelines
- Commit messages must satisfy Commitlint Angular format (see `commitlint.config.js`), e.g. `feat: add directory picker`, `fix: handle ffmpeg permission`.
- Husky hooks enforce quality:
  - `pre-commit`: `lint-staged` (`eslint --fix` on staged `*.js,*.ts,*.tsx`).
  - `commit-msg`: commitlint validation.
- PRs should include:
  - clear summary and scope,
  - linked issue (if any),
  - screenshots/video for UI changes,
  - platforms tested (Web, macOS, Windows where relevant).

## Security & Configuration Tips
- Keep secrets out of source; use `.env`/`.env.tauri` locally.
- Do not commit private signing keys used by Tauri release workflows.
