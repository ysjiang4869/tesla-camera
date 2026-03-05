#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TARGET_ID="current"
BUNDLES_OVERRIDE=""
DRY_RUN=0
DEBUG_BUILD=0
CI_BUILD=0
SKIP_INSTALL=0
SKIP_INIT_BINARIES=0

usage() {
  cat <<'EOF'
Build Tesla Camera for one or many desktop targets.

Usage:
  bash ./scripts/build-multi-platform.sh [options]

Options:
  --target <id>           Build target id: current | all | macos-intel | macos-arm64 | windows-x64
  --bundles <list>        Override bundle types, e.g. app,dmg or msi
  --debug                 Build with tauri --debug
  --ci                    Add tauri --ci
  --dry-run               Print commands only
  --skip-install          Skip pnpm install
  --skip-init-binaries    Skip checking/initializing ffmpeg sidecar binaries
  --list-targets          Print supported target ids and exit
  -h, --help              Show this help

Examples:
  bash ./scripts/build-multi-platform.sh --target current
  bash ./scripts/build-multi-platform.sh --target macos-arm64
  bash ./scripts/build-multi-platform.sh --target all --dry-run
EOF
}

list_targets() {
  cat <<'EOF'
Supported target ids:
  macos-intel  -> x86_64-apple-darwin
  macos-arm64  -> aarch64-apple-darwin
  windows-x64  -> x86_64-pc-windows-msvc
EOF
}

rust_target_for_id() {
  case "$1" in
    macos-intel) echo "x86_64-apple-darwin" ;;
    macos-arm64) echo "aarch64-apple-darwin" ;;
    windows-x64) echo "x86_64-pc-windows-msvc" ;;
    *)
      echo "Unsupported target id: $1" >&2
      exit 1
      ;;
  esac
}

default_bundles_for_id() {
  case "$1" in
    macos-intel|macos-arm64) echo "app,dmg" ;;
    windows-x64) echo "msi" ;;
    *)
      echo "Unsupported target id: $1" >&2
      exit 1
      ;;
  esac
}

required_sidecar_for_id() {
  case "$1" in
    macos-intel) echo "src-tauri/binaries/ffmpeg-x86_64-apple-darwin" ;;
    macos-arm64) echo "src-tauri/binaries/ffmpeg-aarch64-apple-darwin" ;;
    windows-x64) echo "src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe" ;;
    *)
      echo "Unsupported target id: $1" >&2
      exit 1
      ;;
  esac
}

current_target_id() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os" in
    Darwin)
      case "$arch" in
        x86_64) echo "macos-intel" ;;
        arm64|aarch64) echo "macos-arm64" ;;
        *)
          echo "Unsupported macOS arch: $arch" >&2
          exit 1
          ;;
      esac
      ;;
    MINGW*|MSYS*|CYGWIN*|Windows_NT)
      echo "windows-x64"
      ;;
    *)
      echo "Unsupported host OS for target=current: $os" >&2
      echo "Use --target macos-intel|macos-arm64|windows-x64 instead." >&2
      exit 1
      ;;
  esac
}

run_cmd() {
  echo "+ $*"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    "$@"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET_ID="${2:-}"
      shift 2
      ;;
    --bundles)
      BUNDLES_OVERRIDE="${2:-}"
      shift 2
      ;;
    --debug)
      DEBUG_BUILD=1
      shift
      ;;
    --ci)
      CI_BUILD=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --skip-install)
      SKIP_INSTALL=1
      shift
      ;;
    --skip-init-binaries)
      SKIP_INIT_BINARIES=1
      shift
      ;;
    --list-targets)
      list_targets
      exit 0
      ;;
    --)
      shift
      continue
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required but not found in PATH." >&2
  exit 1
fi

TARGETS=()
case "$TARGET_ID" in
  current)
    TARGETS+=("$(current_target_id)")
    ;;
  all)
    TARGETS+=("macos-intel" "macos-arm64" "windows-x64")
    ;;
  macos-intel|macos-arm64|windows-x64)
    TARGETS+=("$TARGET_ID")
    ;;
  *)
    echo "Unsupported --target value: $TARGET_ID" >&2
    usage
    exit 1
    ;;
esac

if [[ "$SKIP_INSTALL" -eq 0 ]]; then
  run_cmd pnpm install --frozen-lockfile
fi

if [[ "$SKIP_INIT_BINARIES" -eq 0 ]]; then
  missing_sidecar=0
  for id in "${TARGETS[@]}"; do
    sidecar_path="$(required_sidecar_for_id "$id")"
    if [[ ! -f "$sidecar_path" ]]; then
      missing_sidecar=1
      break
    fi
  done
  if [[ "$missing_sidecar" -eq 1 ]]; then
    if [[ -x "./init-binaries.sh" || -f "./init-binaries.sh" ]]; then
      run_cmd bash ./init-binaries.sh
    else
      echo "Missing ffmpeg sidecar binaries and init-binaries.sh was not found." >&2
      exit 1
    fi
  fi
fi

for id in "${TARGETS[@]}"; do
  rust_target="$(rust_target_for_id "$id")"
  bundles="$BUNDLES_OVERRIDE"
  if [[ -z "$bundles" ]]; then
    bundles="$(default_bundles_for_id "$id")"
  fi

  echo "==> Building target id: $id ($rust_target), bundles: $bundles"
  cmd=(pnpm tauri build --target "$rust_target" --bundles "$bundles")
  if [[ "$DEBUG_BUILD" -eq 1 ]]; then
    cmd+=(--debug)
  fi
  if [[ "$CI_BUILD" -eq 1 ]]; then
    cmd+=(--ci)
  fi
  run_cmd "${cmd[@]}"
done

echo "All requested builds finished."
